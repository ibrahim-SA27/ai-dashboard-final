from datetime import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, Field, root_validator
from app.models.sensor import EffluentStatus


class SensorDataIn(BaseModel):
    ph: float = Field(..., ge=0.0, le=14.0, description="pH level (0-14)", example=7.2)
    tds: float = Field(..., ge=0.0, description="Total Dissolved Solids (mg/L / ppm)", example=450.0)
    turbidity: float = Field(..., ge=0.0, description="Turbidity (NTU)", example=18.0)
    temperature: float = Field(..., ge=-10.0, le=100.0, description="Temperature (°C)", example=29.5)
    flow_rate: Optional[float] = Field(None, ge=0.0, description="Flow rate", example=2.1)
    flow: Optional[float] = Field(None, ge=0.0, description="Flow alias from ESP32", example=2.1)

    @root_validator(pre=True)
    def unify_flow_fields(cls, values: Any):
        if isinstance(values, dict):
            if "flow" in values and values.get("flow_rate") is None:
                values["flow_rate"] = values["flow"]
            elif "flow_rate" in values and values.get("flow") is None:
                values["flow"] = values["flow_rate"]
        return values


class SensorReadingOut(BaseModel):
    id: int
    timestamp: datetime
    ph: float
    tds: float
    turbidity: float
    temperature: float
    flow_rate: float
    flow: Optional[float] = None
    pollution_score: float
    status: EffluentStatus

    @root_validator(pre=False)
    def populate_flow_alias(cls, values: Any):
        if "flow_rate" in values and values.get("flow") is None:
            values["flow"] = values["flow_rate"]
        return values

    class Config:
        from_attributes = True


class RealtimePayload(BaseModel):
    id: Optional[int] = None
    timestamp: str
    ph: float
    tds: float
    turbidity: float
    temperature: float
    flow_rate: float
    flow: Optional[float] = None
    pollution_score: float
    status: str


class SensorHistoryResponse(BaseModel):
    total: int
    readings: List[SensorReadingOut]
