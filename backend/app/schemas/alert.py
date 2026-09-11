from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.alert import AlertType


class AlertSettingUpdate(BaseModel):
    receiver_email: Optional[EmailStr] = Field(None, example="safety_officer@plant.com")
    enable_email_alert: Optional[bool] = Field(None, example=True)
    critical_threshold: Optional[float] = Field(None, ge=0.0, le=100.0, example=75.0)


class AlertSettingOut(BaseModel):
    id: int
    user_id: int
    receiver_email: str
    enable_email_alert: bool
    critical_threshold: float

    class Config:
        from_attributes = True


class AlertLogOut(BaseModel):
    id: int
    reading_id: Optional[int]
    receiver_email: str
    alert_type: AlertType
    message: str
    sent_at: datetime

    class Config:
        from_attributes = True
