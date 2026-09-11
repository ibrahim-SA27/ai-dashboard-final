from typing import Tuple, Dict, Any, List
from app.models.sensor import EffluentStatus


def evaluate_sensor_metrics(
    ph: float,
    tds: float,
    turbidity: float,
    temperature: float,
    flow_rate: float
) -> Dict[str, Any]:
    """
    Industrial Effluent Safety Automation Evaluation.
    Safe Limits:
      - pH: 6.5 - 8.5
      - TDS: < 800 ppm
      - Turbidity: < 50 NTU
      - Temperature: < 35 °C
      - Flow: < 3.0 L/min

    Critical Condition Detection:
      - If any sensor exceeds its safe threshold: WARNING status
      - If multiple sensors exceed thresholds OR values become highly dangerous: CRITICAL status
    """
    # 1. Check breached status for each sensor
    ph_breached = ph < 6.5 or ph > 8.5
    tds_breached = tds >= 800.0
    turb_breached = turbidity >= 50.0
    temp_breached = temperature >= 35.0
    flow_breached = flow_rate >= 3.0

    # 2. Check highly dangerous conditions
    ph_dangerous = ph < 5.5 or ph > 9.5
    tds_dangerous = tds >= 1500.0
    turb_dangerous = turbidity >= 100.0
    temp_dangerous = temperature >= 40.0
    flow_dangerous = flow_rate >= 5.0

    breached_count = sum([ph_breached, tds_breached, turb_breached, temp_breached, flow_breached])
    has_dangerous = any([ph_dangerous, tds_dangerous, turb_dangerous, temp_dangerous, flow_dangerous])

    # 3. Determine Overall Status
    if breached_count >= 2 or has_dangerous:
        overall_status = EffluentStatus.CRITICAL
    elif breached_count >= 1:
        overall_status = EffluentStatus.WARNING
    else:
        overall_status = EffluentStatus.SAFE

    # 4. Compute 0-100 Risk Points
    def ph_pts(val: float) -> float:
        if 6.5 <= val <= 8.5:
            return (abs(val - 7.0) / 1.5) * 5.0
        elif 5.5 <= val <= 9.5:
            dev = (6.5 - val) / 1.0 if val < 6.5 else (val - 8.5) / 1.0
            return 5.0 + dev * 8.0
        dev = min(1.0, (5.5 - val) / 5.5 if val < 5.5 else (val - 9.5) / 4.5)
        return 13.0 + dev * 7.0

    def tds_pts(val: float) -> float:
        if val < 800.0:
            return (val / 800.0) * 5.0
        elif val < 1500.0:
            return 5.0 + ((val - 800.0) / 700.0) * 8.0
        return 13.0 + min(1.0, (val - 1500.0) / 1500.0) * 7.0

    def turb_pts(val: float) -> float:
        if val < 50.0:
            return (val / 50.0) * 5.0
        elif val < 100.0:
            return 5.0 + ((val - 50.0) / 50.0) * 8.0
        return 13.0 + min(1.0, (val - 100.0) / 100.0) * 7.0

    def temp_pts(val: float) -> float:
        if val < 35.0:
            return max(0.0, (val / 35.0) * 5.0)
        elif val < 40.0:
            return 5.0 + ((val - 35.0) / 5.0) * 8.0
        return 13.0 + min(1.0, (val - 40.0) / 20.0) * 7.0

    def flow_pts(val: float) -> float:
        if val < 3.0:
            return (val / 3.0) * 5.0
        elif val < 5.0:
            return 5.0 + ((val - 3.0) / 2.0) * 8.0
        return 13.0 + min(1.0, (val - 5.0) / 5.0) * 7.0

    p_score = ph_pts(ph) + tds_pts(tds) + turb_pts(turbidity) + temp_pts(temperature) + flow_pts(flow_rate)

    if overall_status == EffluentStatus.CRITICAL:
        final_score = round(max(70.0, min(100.0, p_score)), 1)
    elif overall_status == EffluentStatus.WARNING:
        final_score = round(max(26.0, min(65.0, p_score)), 1)
    else:
        final_score = round(max(0.0, min(25.0, p_score)), 1)

    return {
        "pollution_score": final_score,
        "status": overall_status,
        "details": {
            "ph": {"value": ph, "breached": ph_breached, "dangerous": ph_dangerous},
            "tds": {"value": tds, "breached": tds_breached, "dangerous": tds_dangerous},
            "turbidity": {"value": turbidity, "breached": turb_breached, "dangerous": turb_dangerous},
            "temperature": {"value": temperature, "breached": temp_breached, "dangerous": temp_dangerous},
            "flow_rate": {"value": flow_rate, "breached": flow_breached, "dangerous": flow_dangerous},
        }
    }
