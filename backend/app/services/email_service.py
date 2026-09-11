import logging
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, List
import aiosmtplib

from app.config import settings
from app.models.sensor import SensorReading
from app.models.alert import AlertType

logger = logging.getLogger(__name__)


def get_configured_email_receivers() -> List[str]:
    """Reads comma-separated receivers from EMAIL_RECEIVERS environment variable."""
    raw = os.getenv("EMAIL_RECEIVERS", "")
    receivers = [addr.strip() for addr in raw.split(",") if addr.strip() and "@" in addr]
    return receivers


def build_alert_email_body(
    reading: SensorReading,
    severity: str = "CRITICAL",
    risk_score: float = 0.0,
    valve_state: str = "CLOSED",
    relay_status: str = "ACTIVATED",
    discharge_status: str = "BLOCKED",
    location: Optional[str] = None,
    safety_action: Optional[str] = None,
) -> str:
    """Format alert email body according to industrial safety specification."""
    ts_str = (
        reading.timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
        if isinstance(reading.timestamp, datetime)
        else str(reading.timestamp)
    )
    loc = location or os.getenv(
        "PLANT_LOCATION", "Industrial Effluent Treatment Outfall - Monitoring Zone 1"
    )
    action = (
        safety_action
        or "Automatic Emergency Shutdown Triggered: Discharge Solenoid Valve Closed, Safety Relay Activated, Effluent Outflow Blocked to prevent environmental contamination."
    )

    body = f"""[SEVERITY LEVEL]: {severity}
[POLLUTION RISK SCORE]: {risk_score:.0f}/100
[VALVE STATE]: {valve_state}
[RELAY STATUS]: {relay_status}
[DISCHARGE STATUS]: {discharge_status}
[LOCATION]: {loc}
[TIMESTAMP]: {ts_str}

SENSOR READINGS:
- pH: {reading.ph:.2f}
- TDS: {reading.tds:.0f} ppm
- Turbidity: {reading.turbidity:.0f} NTU
- Temperature: {reading.temperature:.1f} °C
- Flow: {reading.flow_rate:.1f} L/min

SAFETY ACTION PERFORMED:
{action}
"""
    return body


async def send_email_alert(
    reading: SensorReading,
    severity: str = "CRITICAL",
    risk_score: Optional[float] = None,
    valve_state: str = "CLOSED",
    relay_status: str = "ACTIVATED",
    discharge_status: str = "BLOCKED",
    alert_type: AlertType = AlertType.CRITICAL_POLLUTION,
    custom_message: Optional[str] = None,
) -> bool:
    """
    Sends effluent safety alert emails to all configured recipients from EMAIL_RECEIVERS via SMTP.
    Returns True if processed successfully.
    """
    if not settings.ENABLE_EMAIL_ALERTS:
        logger.info("Email alerts are globally disabled in settings.")
        return False

    receivers = get_configured_email_receivers()
    if not receivers:
        logger.warning(
            f"[SAFETY ALERT] Critical condition detected (Score: {reading.pollution_score:.1f}), but no EMAIL_RECEIVERS configured."
        )
        return False

    actual_score = risk_score if risk_score is not None else reading.pollution_score
    subject = "🚨 EFFLUENT DASHBOARD - INDUSTRIAL SAFETY ALERT"
    body_text = build_alert_email_body(
        reading=reading,
        severity=severity,
        risk_score=actual_score,
        valve_state=valve_state,
        relay_status=relay_status,
        discharge_status=discharge_status,
        safety_action=custom_message,
    )

    # If SMTP credentials are not configured or are placeholders, log email simulation
    is_placeholder_pass = (
        not settings.SMTP_PASSWORD
        or settings.SMTP_PASSWORD.startswith("YOUR_")
        or "APP_PASSWORD" in settings.SMTP_PASSWORD
    )
    if not settings.SMTP_USER or is_placeholder_pass:
        logger.warning(
            f"[SMTP Alert - Placeholder/Simulation] To: {', '.join(receivers)} | Subject: {subject}\n{body_text}"
        )
        return True

    from_addr = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
    all_success = True

    for receiver in receivers:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = receiver
        msg.attach(MIMEText(body_text, "plain"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                start_tls=True,
                timeout=10,
            )
            logger.info(f"Effluent alert email successfully sent to {receiver}")
        except Exception as e:
            logger.error(f"Failed to send email alert to {receiver} via SMTP: {e}")
            all_success = False

    return all_success
