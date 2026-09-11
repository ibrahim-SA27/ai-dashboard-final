from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.alert import AlertSetting, AlertLog, AlertType
from app.models.user import User
from app.schemas.alert import AlertSettingUpdate, AlertSettingOut, AlertLogOut
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api", tags=["Alerts & Gmail Alert Settings"])


@router.get(
    "/alerts",
    response_model=List[AlertLogOut],
    summary="Get recent alert logs"
)
def get_alerts(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    alert_type: Optional[AlertType] = Query(None),
    db: Session = Depends(get_db)
):
    """Retrieves all past effluent alert logs sent to operators."""
    query = db.query(AlertLog)
    if alert_type:
        query = query.filter(AlertLog.alert_type == alert_type)

    logs = query.order_by(desc(AlertLog.sent_at)).offset(offset).limit(limit).all()
    return logs


@router.get(
    "/alert-settings",
    response_model=AlertSettingOut,
    summary="Get alert settings"
)
def get_alert_settings(
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns the alert configuration for the current authenticated user."""
    setting = db.query(AlertSetting).filter(AlertSetting.user_id == current_user.id).first()
    if not setting:
        # Create default if absent
        setting = AlertSetting(
            user_id=current_user.id,
            receiver_email=current_user.email,
            enable_email_alert=True,
            critical_threshold=75.0
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return setting


@router.put(
    "/alert-settings",
    response_model=AlertSettingOut,
    summary="Update alert settings and receiver email"
)
def update_alert_settings(
    payload: AlertSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Updates customizable Gmail alert preferences:
    - Receiver email
    - Alert notification toggle (enable/disable)
    - Custom critical pollution score threshold
    """
    setting = db.query(AlertSetting).filter(AlertSetting.user_id == current_user.id).first()
    if not setting:
        setting = AlertSetting(
            user_id=current_user.id,
            receiver_email=str(payload.receiver_email or current_user.email),
            enable_email_alert=payload.enable_email_alert if payload.enable_email_alert is not None else True,
            critical_threshold=payload.critical_threshold if payload.critical_threshold is not None else 75.0
        )
        db.add(setting)
    else:
        if payload.receiver_email is not None:
            setting.receiver_email = str(payload.receiver_email)
        if payload.enable_email_alert is not None:
            setting.enable_email_alert = payload.enable_email_alert
        if payload.critical_threshold is not None:
            setting.critical_threshold = payload.critical_threshold

    db.commit()
    db.refresh(setting)
    return setting
