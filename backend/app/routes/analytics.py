from datetime import datetime, timedelta
from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.sensor import SensorReading, EffluentStatus
from app.models.alert import AlertLog
from app.schemas.analytics import StatisticsOut, MetricAverage

router = APIRouter(prefix="/api", tags=["Pollution Analytics & Statistics"])


def compute_timeframe_averages(db: Session, since: datetime) -> MetricAverage:
    """Helper to compute metric averages for a specific time window."""
    result = db.query(
        func.avg(SensorReading.ph).label("avg_ph"),
        func.avg(SensorReading.tds).label("avg_tds"),
        func.avg(SensorReading.turbidity).label("avg_turbidity"),
        func.avg(SensorReading.temperature).label("avg_temp"),
        func.avg(SensorReading.flow_rate).label("avg_flow"),
        func.avg(SensorReading.pollution_score).label("avg_score"),
        func.count(SensorReading.id).label("count")
    ).filter(SensorReading.timestamp >= since).first()

    if not result or not result.count:
        return MetricAverage()

    return MetricAverage(
        ph=round(float(result.avg_ph or 0.0), 2),
        tds=round(float(result.avg_tds or 0.0), 1),
        turbidity=round(float(result.avg_turbidity or 0.0), 1),
        temperature=round(float(result.avg_temp or 0.0), 1),
        flow_rate=round(float(result.avg_flow or 0.0), 2),
        pollution_score=round(float(result.avg_score or 0.0), 1),
        sample_count=int(result.count or 0)
    )


@router.get(
    "/statistics",
    response_model=StatisticsOut,
    summary="Get aggregated effluent monitoring analytics and statistics"
)
def get_statistics(db: Session = Depends(get_db)):
    """
    Computes real-time effluent analytics:
    - Daily pollution average (past 24h)
    - Weekly pollution average (past 7 days)
    - Monthly pollution average (past 30 days)
    - Total alerts logged
    - Safe, Warning, and Critical reading counts
    - Total sensor readings
    """
    now = datetime.utcnow()
    one_day_ago = now - timedelta(days=1)
    one_week_ago = now - timedelta(days=7)
    one_month_ago = now - timedelta(days=30)

    # Timeframe averages
    daily_metrics = compute_timeframe_averages(db, one_day_ago)
    weekly_metrics = compute_timeframe_averages(db, one_week_ago)
    monthly_metrics = compute_timeframe_averages(db, one_month_ago)

    # Total counts by status
    safe_count = db.query(SensorReading).filter(SensorReading.status == EffluentStatus.SAFE).count()
    warning_count = db.query(SensorReading).filter(SensorReading.status == EffluentStatus.WARNING).count()
    critical_count = db.query(SensorReading).filter(SensorReading.status == EffluentStatus.CRITICAL).count()
    total_readings = db.query(SensorReading).count()

    # Total alerts sent
    total_alerts = db.query(AlertLog).count()

    return StatisticsOut(
        daily_pollution_avg=daily_metrics.pollution_score or 0.0,
        weekly_pollution_avg=weekly_metrics.pollution_score or 0.0,
        monthly_pollution_avg=monthly_metrics.pollution_score or 0.0,
        total_alerts=total_alerts,
        safe_readings_count=safe_count,
        warning_readings_count=warning_count,
        critical_readings_count=critical_count,
        total_readings=total_readings,
        daily_metric_averages=daily_metrics,
        weekly_metric_averages=weekly_metrics,
        monthly_metric_averages=monthly_metrics
    )
