import enum
from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Enum, DateTime
from sqlalchemy.orm import relationship
from app.database import Base


class EffluentStatus(str, enum.Enum):
    SAFE = "SAFE"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    ph = Column(Float, nullable=False)
    tds = Column(Float, nullable=False)
    turbidity = Column(Float, nullable=False)
    temperature = Column(Float, nullable=False)
    flow_rate = Column(Float, nullable=False)
    pollution_score = Column(Float, nullable=False)
    status = Column(Enum(EffluentStatus), default=EffluentStatus.SAFE, nullable=False, index=True)

    # Relationships
    alert_logs = relationship("AlertLog", back_populates="reading", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<SensorReading id={self.id} status={self.status} score={self.pollution_score}>"
