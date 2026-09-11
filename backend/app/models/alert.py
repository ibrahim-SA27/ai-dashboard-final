import enum
from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Boolean, Enum, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base


class AlertType(str, enum.Enum):
    CRITICAL_POLLUTION = "CRITICAL_POLLUTION"
    ABNORMAL_DISCHARGE = "ABNORMAL_DISCHARGE"
    SENSOR_FAILURE = "SENSOR_FAILURE"


class AlertSetting(Base):
    __tablename__ = "alert_settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    receiver_email = Column(String(255), nullable=False)
    enable_email_alert = Column(Boolean, default=True, nullable=False)
    critical_threshold = Column(Float, default=75.0, nullable=False)

    # Relationships
    user = relationship("User", back_populates="alert_settings")

    def __repr__(self):
        return f"<AlertSetting user_id={self.user_id} receiver={self.receiver_email} enabled={self.enable_email_alert}>"


class AlertLog(Base):
    __tablename__ = "alert_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    reading_id = Column(Integer, ForeignKey("sensor_readings.id", ondelete="SET NULL"), nullable=True, index=True)
    receiver_email = Column(String(255), nullable=False)
    alert_type = Column(Enum(AlertType), default=AlertType.CRITICAL_POLLUTION, nullable=False)
    message = Column(Text, nullable=False)
    sent_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    reading = relationship("SensorReading", back_populates="alert_logs")

    def __repr__(self):
        return f"<AlertLog id={self.id} type={self.alert_type} sent_at={self.sent_at}>"
