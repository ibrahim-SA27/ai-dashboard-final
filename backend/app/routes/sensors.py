import asyncio
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.sensor import SensorReading, EffluentStatus
from app.models.alert import AlertSetting, AlertLog, AlertType
from app.schemas.sensor import (
    SensorDataIn,
    SensorReadingOut,
    SensorHistoryResponse,
    RealtimePayload,
)
from app.services.pollution_calculator import evaluate_sensor_metrics
from app.services.email_service import send_email_alert
from app.websocket.connection import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Sensor Data & Real-Time Monitoring"])


async def _handle_ingestion(payload: SensorDataIn, db: Session) -> SensorReading:
    flow_value = payload.flow_rate if payload.flow_rate is not None else (payload.flow or 0.0)

    # 1. Evaluate metrics, status, and 0-100 composite pollution score
    eval_result = evaluate_sensor_metrics(
        ph=payload.ph,
        tds=payload.tds,
        turbidity=payload.turbidity,
        temperature=payload.temperature,
        flow_rate=flow_value
    )
    pollution_score = eval_result["pollution_score"]
    effluent_status = eval_result["status"]

    # 2. Persist in database
    new_reading = SensorReading(
        timestamp=datetime.utcnow(),
        ph=payload.ph,
        tds=payload.tds,
        turbidity=payload.turbidity,
        temperature=payload.temperature,
        flow_rate=flow_value,
        pollution_score=pollution_score,
        status=effluent_status
    )
    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)

    # 3. Broadcast to all connected WebSocket clients in real-time
    ws_payload = {
        "id": new_reading.id,
        "timestamp": new_reading.timestamp.isoformat(),
        "ph": round(new_reading.ph, 2),
        "tds": round(new_reading.tds, 1),
        "turbidity": round(new_reading.turbidity, 1),
        "temperature": round(new_reading.temperature, 1),
        "flow": round(new_reading.flow_rate, 2),
        "flow_rate": round(new_reading.flow_rate, 2),
        "pollution_score": round(new_reading.pollution_score, 1),
        "status": new_reading.status.value,
    }
    asyncio.create_task(ws_manager.broadcast(ws_payload))

    # 4. Check for Alert Triggers
    is_critical_status = effluent_status == EffluentStatus.CRITICAL
    is_abnormal_discharge = flow_value >= 5.0 and effluent_status != EffluentStatus.SAFE

    if is_critical_status or is_abnormal_discharge:
        alert_type = (
            AlertType.ABNORMAL_DISCHARGE
            if is_abnormal_discharge and not is_critical_status
            else AlertType.CRITICAL_POLLUTION
        )

        # Send safety alert to all configured EMAIL_RECEIVERS as well as any configured in alert_settings
        action_msg = (
            "Automatic Emergency Shutdown Triggered: Discharge Solenoid Valve Closed, Safety Relay Activated, Effluent Outflow Blocked to prevent environmental contamination."
            if is_critical_status
            else f"Abnormal discharge rate of {flow_value:.2f} L/min detected with score {pollution_score:.1f}."
        )

        asyncio.create_task(
            send_email_alert(
                reading=new_reading,
                severity="CRITICAL" if is_critical_status else "WARNING",
                risk_score=pollution_score,
                valve_state="CLOSED" if is_critical_status else "OPEN",
                relay_status="ACTIVATED" if is_critical_status else "INACTIVE",
                discharge_status="BLOCKED" if is_critical_status else "NORMAL",
                alert_type=alert_type,
                custom_message=action_msg,
            )
        )

        alert_settings = db.query(AlertSetting).filter(
            AlertSetting.enable_email_alert == True,
            AlertSetting.critical_threshold <= pollution_score
        ).all()

        for setting in alert_settings:
            alert_log = AlertLog(
                reading_id=new_reading.id,
                receiver_email=setting.receiver_email,
                alert_type=alert_type,
                message=action_msg,
                sent_at=datetime.utcnow()
            )
            db.add(alert_log)

        db.commit()

    return new_reading


@router.post(
    "/sensors/data",
    response_model=SensorReadingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest sensor readings from ESP32"
)
async def ingest_esp32_sensor_data(payload: SensorDataIn, db: Session = Depends(get_db)):
    return await _handle_ingestion(payload, db)


@router.post(
    "/sensor-data",
    response_model=SensorReadingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest sensor readings (compatibility endpoint)"
)
async def ingest_sensor_data_legacy(payload: SensorDataIn, db: Session = Depends(get_db)):
    return await _handle_ingestion(payload, db)


@router.get(
    "/sensors/current",
    response_model=Optional[SensorReadingOut],
    summary="Get most recent real sensor reading"
)
def get_current_reading(response: Response, db: Session = Depends(get_db)):
    """Fetches the most recent effluent reading from the database. Returns 204 if no data yet."""
    latest = db.query(SensorReading).order_by(desc(SensorReading.timestamp)).first()
    if not latest:
        response.status_code = status.HTTP_204_NO_CONTENT
        return None
    return latest


@router.get(
    "/latest-reading",
    response_model=Optional[SensorReadingOut],
    summary="Get most recent sensor reading (compatibility endpoint)"
)
def get_latest_reading_compat(response: Response, db: Session = Depends(get_db)):
    latest = db.query(SensorReading).order_by(desc(SensorReading.timestamp)).first()
    if not latest:
        response.status_code = status.HTTP_204_NO_CONTENT
        return None
    return latest


@router.get(
    "/sensors/history",
    response_model=SensorHistoryResponse,
    summary="Get historical sensor readings"
)
def get_sensor_history_records(
    limit: int = Query(50, ge=1, le=1000, description="Max number of readings to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    status: Optional[EffluentStatus] = Query(None, description="Filter by status (SAFE, WARNING, CRITICAL)"),
    db: Session = Depends(get_db)
):
    query = db.query(SensorReading)
    if status:
        query = query.filter(SensorReading.status == status)

    total = query.count()
    readings = query.order_by(desc(SensorReading.timestamp)).offset(offset).limit(limit).all()

    return SensorHistoryResponse(
        total=total,
        readings=readings
    )


@router.get(
    "/history",
    response_model=SensorHistoryResponse,
    summary="Get historical sensor readings (compatibility endpoint)"
)
def get_sensor_history_compat(
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    status: Optional[EffluentStatus] = Query(None),
    db: Session = Depends(get_db)
):
    return get_sensor_history_records(limit=limit, offset=offset, status=status, db=db)
