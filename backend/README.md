# Industrial Effluent Monitoring & Harmful Water Detection System - Backend

Production-ready backend service built with **FastAPI**, **PostgreSQL**, **SQLAlchemy ORM**, **Alembic**, **JWT Authentication**, and **WebSockets** for high-frequency industrial effluent monitoring and automated environmental discharge safety.

---

## 🛠 Tech Stack

- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL with SQLAlchemy 2.0 ORM
- **Migrations**: Alembic
- **Real-Time Streaming**: Native WebSockets (`/ws/realtime`)
- **Security & Auth**: JWT (Access + Refresh Tokens) with bcrypt password hashing
- **Notifications**: Async Gmail SMTP alert service (`aiosmtplib`)
- **Containerization**: Docker & Docker Compose

---

## 📁 Directory Structure

```
backend/
├── app/
│   ├── main.py                 # Application entry point, CORS, Rate Limiting & WebSockets
│   ├── config.py               # Pydantic Settings & Environment Variables
│   ├── database.py             # SQLAlchemy Engine, SessionLocal & get_db Dependency
│   ├── models/                 # SQLAlchemy Database Models
│   │   ├── __init__.py
│   │   ├── user.py             # User & Roles (Admin/User)
│   │   ├── sensor.py           # SensorReadings & Status (SAFE/WARNING/CRITICAL)
│   │   └── alert.py            # AlertSettings & AlertLogs
│   ├── schemas/                # Pydantic Request/Response Validation Models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── sensor.py
│   │   ├── alert.py
│   │   └── analytics.py
│   ├── routes/                 # API Endpoint Routers
│   │   ├── __init__.py
│   │   ├── auth.py             # Registration, Login, Logout, Profile, Password Change
│   │   ├── sensors.py          # ESP32 Ingestion, Latest Reading, History
│   │   ├── alerts.py           # Alert Logs & Custom User Alert Settings
│   │   └── analytics.py        # 24h, 7d, 30d Pollution Averages & Statistics
│   ├── services/
│   │   ├── __init__.py
│   │   ├── pollution_calculator.py  # 0-100 Pollution Score & Status Evaluation
│   │   └── email_service.py         # Asynchronous Gmail SMTP Alert Dispatcher
│   ├── websocket/
│   │   ├── __init__.py
│   │   └── manager.py          # Multi-client Real-Time Broadcast Manager
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── jwt.py              # JWT Encoding / Decoding
│   │   └── dependencies.py     # Auth & Role Dependencies
│   └── utils/
│       ├── __init__.py
│       └── security.py         # bcrypt Password Hashing Utilities
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       └── 001_initial_schema.py
├── alembic.ini
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## ⚡ Quick Start with Docker

The fastest way to launch the entire backend and PostgreSQL database:

```bash
cd backend
cp .env.example .env
docker compose up --build -d
```

- **Swagger API Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **WebSocket Endpoint**: `ws://localhost:8000/ws/realtime`

---

## 💻 Manual Setup & Local Execution

### 1. Create Virtual Environment & Install Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in credentials:

```bash
cp .env.example .env
```

### 3. Run Database Migrations

```bash
alembic upgrade head
```

### 4. Start the FastAPI Development Server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 📡 API Endpoint Reference

### 🔐 Authentication & Operator Management

| Method | Endpoint               | Description                                         | Auth Required |
| ------ | ---------------------- | --------------------------------------------------- | ------------- |
| `POST` | `/api/register`        | Register new operator / admin                       | No            |
| `POST` | `/api/login`           | Authenticate and obtain JWT access + refresh tokens | No            |
| `POST` | `/api/refresh`         | Refresh expired access token                        | No            |
| `POST` | `/api/logout`          | End session                                         | Yes           |
| `GET`  | `/api/profile`         | Get current authenticated operator profile          | Yes           |
| `POST` | `/api/change-password` | Update operator password                            | Yes           |

### 🎛 Sensor Telemetry & Ingestion

| Method | Endpoint              | Description                                  | Auth Required |
| ------ | --------------------- | -------------------------------------------- | ------------- |
| `POST` | `/api/sensor-data`    | Ingest live hardware telemetry (ESP32/SCADA) | No            |
| `GET`  | `/api/latest-reading` | Fetch most recent effluent metrics           | No            |
| `GET`  | `/api/history`        | Paginated sensor history with status filters | No            |

### 📊 Analytics & Reporting

| Method | Endpoint          | Description                                               | Auth Required |
| ------ | ----------------- | --------------------------------------------------------- | ------------- |
| `GET`  | `/api/statistics` | Daily, weekly, monthly pollution averages & count metrics | No            |

### 🚨 Alerts & Gmail Settings

| Method | Endpoint              | Description                                                      | Auth Required |
| ------ | --------------------- | ---------------------------------------------------------------- | ------------- |
| `GET`  | `/api/alerts`         | Retrieve logged emergency discharge alerts                       | No            |
| `GET`  | `/api/alert-settings` | Get alert preferences for current operator                       | Yes           |
| `PUT`  | `/api/alert-settings` | Update receiver email, toggle alerts, and set critical threshold | Yes           |

---

## 🔌 Real-Time WebSocket (`/ws/realtime`)

Connect via WebSocket to receive instant broadcasts as soon as an ESP32 or sensor node posts new readings:

```javascript
const socket = new WebSocket("ws://localhost:8000/ws/realtime");

socket.onopen = () => {
  console.log("Connected to SCADA Real-Time Stream");
};

socket.onmessage = (event) => {
  const telemetry = JSON.parse(event.data);
  console.log("Live Sensor Update:", telemetry);
  // Example payload:
  // {
  //   "id": 104,
  //   "timestamp": "2026-08-21T12:00:00.123456",
  //   "ph": 7.1,
  //   "tds": 430.0,
  //   "turbidity": 15.0,
  //   "temperature": 29.0,
  //   "flow_rate": 2.2,
  //   "pollution_score": 12.0,
  //   "status": "SAFE"
  // }
};
```

---

## 📟 ESP32 / Industrial Microcontroller Integration

Example Arduino / C++ snippet for ESP32 hardware posting data over HTTP:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* serverUrl = "http://YOUR_SERVER_IP:8000/api/sensor-data";

void sendEffluentReading(float ph, float tds, float turbidity, float temp, float flow) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<200> doc;
    doc["ph"] = ph;
    doc["tds"] = tds;
    doc["turbidity"] = turbidity;
    doc["temperature"] = temp;
    doc["flow_rate"] = flow;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    http.end();
  }
}
```

---

## 📧 Gmail SMTP Alert Setup

1. Enable 2-Step Verification on your Google account.
2. Generate an **App Password** under Google Account Security > App Passwords.
3. In `.env`:
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASSWORD=your_16_char_app_password
   SMTP_FROM_EMAIL=your_email@gmail.com
   ENABLE_EMAIL_ALERTS=true
   DEFAULT_CRITICAL_THRESHOLD=75.0
   ```
4. Alerts are automatically dispatched upon detecting **CRITICAL** status or sudden **ABNORMAL_DISCHARGE** events.
