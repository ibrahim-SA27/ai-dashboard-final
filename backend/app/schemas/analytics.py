from typing import Dict, Optional
from pydantic import BaseModel


class MetricAverage(BaseModel):
    ph: Optional[float] = 0.0
    tds: Optional[float] = 0.0
    turbidity: Optional[float] = 0.0
    temperature: Optional[float] = 0.0
    flow_rate: Optional[float] = 0.0
    pollution_score: Optional[float] = 0.0
    sample_count: int = 0


class StatisticsOut(BaseModel):
    daily_pollution_avg: float
    weekly_pollution_avg: float
    monthly_pollution_avg: float
    total_alerts: int
    safe_readings_count: int
    warning_readings_count: int
    critical_readings_count: int
    total_readings: int
    daily_metric_averages: Optional[MetricAverage] = None
    weekly_metric_averages: Optional[MetricAverage] = None
    monthly_metric_averages: Optional[MetricAverage] = None
