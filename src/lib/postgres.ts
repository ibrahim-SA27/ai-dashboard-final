import { Pool, type PoolClient } from "pg";

// Parse DATABASE_URL or ASYNC_DATABASE_URL from environment
function getDatabaseUrl(): string {
  const syncUrl = process.env.DATABASE_URL;
  if (syncUrl && syncUrl.trim().length > 0) {
    return syncUrl.trim();
  }

  const asyncUrl = process.env.ASYNC_DATABASE_URL;
  if (asyncUrl && asyncUrl.trim().length > 0) {
    // Convert python asyncpg format if needed: postgresql+asyncpg:// -> postgresql://
    return asyncUrl.trim().replace(/^postgresql\+asyncpg:\/\//, "postgresql://");
  }

  throw new Error("Neither DATABASE_URL nor ASYNC_DATABASE_URL is set in the environment.");
}

let poolInstance: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!poolInstance) {
    const connectionString = getDatabaseUrl();
    poolInstance = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    poolInstance.on("error", (err) => {
      console.error("[PostgreSQL Pool Error]:", err.message);
    });
  }
  return poolInstance;
}

export interface SensorReadingRow {
  id: number;
  timestamp: Date | string;
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow_rate: number;
  pollution_score: number;
  status: "SAFE" | "WARNING" | "CRITICAL";
}

export interface AlertLogRow {
  id: number;
  reading_id: number | null;
  receiver_email: string;
  alert_type: "CRITICAL_POLLUTION" | "ABNORMAL_DISCHARGE" | "SENSOR_FAILURE";
  message: string;
  sent_at: Date | string;
}

export interface UserRow {
  id: number;
  full_name: string;
  email: string;
  password_hash: string;
  role: "ADMIN" | "USER";
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AlertSettingRow {
  id: number;
  user_id: number;
  receiver_email: string;
  enable_email_alert: boolean;
  critical_threshold: number;
}

// 1. Alembic-compatible schema verification and migration
let schemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;

export async function ensureDatabaseSchema(): Promise<void> {
  if (schemaInitialized) return;
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    const pool = getPostgresPool();
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");

      // Types / Enums
      await client.query(`
        DO $$ BEGIN
          CREATE TYPE userrole AS ENUM ('ADMIN', 'USER');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await client.query(`
        DO $$ BEGIN
          CREATE TYPE effluentstatus AS ENUM ('SAFE', 'WARNING', 'CRITICAL');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await client.query(`
        DO $$ BEGIN
          CREATE TYPE alerttype AS ENUM ('CRITICAL_POLLUTION', 'ABNORMAL_DISCHARGE', 'SENSOR_FAILURE');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 1. users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          full_name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role userrole NOT NULL DEFAULT 'USER',
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);
        CREATE INDEX IF NOT EXISTS ix_users_id ON users (id);
      `);

      // 2. sensor_readings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sensor_readings (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
          ph DOUBLE PRECISION NOT NULL,
          tds DOUBLE PRECISION NOT NULL,
          turbidity DOUBLE PRECISION NOT NULL,
          temperature DOUBLE PRECISION NOT NULL,
          flow_rate DOUBLE PRECISION NOT NULL,
          pollution_score DOUBLE PRECISION NOT NULL,
          status effluentstatus NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_sensor_readings_id ON sensor_readings (id);
        CREATE INDEX IF NOT EXISTS ix_sensor_readings_status ON sensor_readings (status);
        CREATE INDEX IF NOT EXISTS ix_sensor_readings_timestamp ON sensor_readings (timestamp);
      `);

      // 3. alert_settings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS alert_settings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          receiver_email VARCHAR(255) NOT NULL,
          enable_email_alert BOOLEAN NOT NULL DEFAULT TRUE,
          critical_threshold DOUBLE PRECISION NOT NULL DEFAULT 75.0
        );
        CREATE INDEX IF NOT EXISTS ix_alert_settings_id ON alert_settings (id);
        CREATE INDEX IF NOT EXISTS ix_alert_settings_user_id ON alert_settings (user_id);
      `);

      // 4. alert_logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS alert_logs (
          id SERIAL PRIMARY KEY,
          reading_id INTEGER REFERENCES sensor_readings(id) ON DELETE SET NULL,
          receiver_email VARCHAR(255) NOT NULL,
          alert_type alerttype NOT NULL,
          message TEXT NOT NULL,
          sent_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_alert_logs_id ON alert_logs (id);
        CREATE INDEX IF NOT EXISTS ix_alert_logs_reading_id ON alert_logs (reading_id);
        CREATE INDEX IF NOT EXISTS ix_alert_logs_sent_at ON alert_logs (sent_at);
      `);

      // 5. alembic_version table
      await client.query(`
        CREATE TABLE IF NOT EXISTS alembic_version (
          version_num VARCHAR(32) NOT NULL PRIMARY KEY
        );
        INSERT INTO alembic_version (version_num)
        SELECT '001_initial_schema'
        WHERE NOT EXISTS (SELECT 1 FROM alembic_version);
      `);

      await client.query("COMMIT");
      schemaInitialized = true;
      console.info("[PostgreSQL]: Supabase Postgres schema verified and operational.");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[PostgreSQL Schema Initialization Error]:", err);
      throw err;
    } finally {
      client.release();
    }
  })();

  return schemaInitPromise;
}

// 2. Sensor Readings Persistence
export async function persistSensorReading(data: {
  ph: number;
  tds: number;
  turbidity: number;
  temperature: number;
  flow_rate: number;
  pollution_score: number;
  status: "SAFE" | "WARNING" | "CRITICAL";
  timestamp?: Date;
}): Promise<SensorReadingRow> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const query = `
    INSERT INTO sensor_readings (timestamp, ph, tds, turbidity, temperature, flow_rate, pollution_score, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id, timestamp, ph, tds, turbidity, temperature, flow_rate, pollution_score, status
  `;

  const values = [
    data.timestamp || new Date(),
    data.ph,
    data.tds,
    data.turbidity,
    data.temperature,
    data.flow_rate,
    data.pollution_score,
    data.status,
  ];

  const res = await pool.query<SensorReadingRow>(query, values);
  return res.rows[0];
}

export async function getLatestSensorReading(): Promise<SensorReadingRow | null> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();
  const res = await pool.query<SensorReadingRow>(`
    SELECT id, timestamp, ph, tds, turbidity, temperature, flow_rate, pollution_score, status
    FROM sensor_readings
    ORDER BY timestamp DESC, id DESC
    LIMIT 1
  `);
  return res.rows[0] || null;
}

export async function getSensorReadingHistory(
  limit = 50,
  offset = 0,
  status?: string,
): Promise<{ readings: SensorReadingRow[]; total: number }> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  let countQuery = "SELECT COUNT(*) FROM sensor_readings";
  let selectQuery = `
    SELECT id, timestamp, ph, tds, turbidity, temperature, flow_rate, pollution_score, status
    FROM sensor_readings
  `;
  const params: unknown[] = [];

  if (status) {
    countQuery += " WHERE status = $1";
    selectQuery += " WHERE status = $1";
    params.push(status);
  }

  const countRes = await pool.query<{ count: string }>(countQuery, params);
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  const limitParamIdx = params.length + 1;
  const offsetParamIdx = params.length + 2;
  selectQuery += ` ORDER BY timestamp DESC, id DESC LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`;

  const rowsRes = await pool.query<SensorReadingRow>(selectQuery, [...params, limit, offset]);

  return {
    readings: rowsRes.rows,
    total,
  };
}

export async function getSensorStatistics(): Promise<{
  total_readings: number;
  critical_readings_count: number;
  warning_readings_count: number;
  safe_readings_count: number;
  total_alerts: number;
  avg_ph: number;
  avg_tds: number;
  avg_turbidity: number;
  avg_temperature: number;
  avg_flow: number;
}> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const statsRes = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status = 'CRITICAL' THEN 1 END) as critical_count,
      COUNT(CASE WHEN status = 'WARNING' THEN 1 END) as warning_count,
      COUNT(CASE WHEN status = 'SAFE' THEN 1 END) as safe_count,
      AVG(ph) as avg_ph,
      AVG(tds) as avg_tds,
      AVG(turbidity) as avg_turbidity,
      AVG(temperature) as avg_temperature,
      AVG(flow_rate) as avg_flow
    FROM sensor_readings
  `);

  const alertCountRes = await pool.query("SELECT COUNT(*) as total_alerts FROM alert_logs");

  const row = statsRes.rows[0] || {};
  return {
    total_readings: parseInt(row.total || "0", 10),
    critical_readings_count: parseInt(row.critical_count || "0", 10),
    warning_readings_count: parseInt(row.warning_count || "0", 10),
    safe_readings_count: parseInt(row.safe_count || "0", 10),
    total_alerts: parseInt(alertCountRes.rows[0]?.total_alerts || "0", 10),
    avg_ph: Number(row.avg_ph || 7.2),
    avg_tds: Number(row.avg_tds || 450),
    avg_turbidity: Number(row.avg_turbidity || 8),
    avg_temperature: Number(row.avg_temperature || 26),
    avg_flow: Number(row.avg_flow || 10),
  };
}

// 3. Alert Logs
export async function persistAlertLog(data: {
  reading_id: number | null;
  receiver_email: string;
  alert_type: "CRITICAL_POLLUTION" | "ABNORMAL_DISCHARGE" | "SENSOR_FAILURE";
  message: string;
  sent_at?: Date;
}): Promise<AlertLogRow> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const res = await pool.query<AlertLogRow>(
    `
    INSERT INTO alert_logs (reading_id, receiver_email, alert_type, message, sent_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, reading_id, receiver_email, alert_type, message, sent_at
  `,
    [
      data.reading_id,
      data.receiver_email,
      data.alert_type,
      data.message,
      data.sent_at || new Date(),
    ],
  );

  return res.rows[0];
}

export async function getAlertLogs(limit = 50, offset = 0): Promise<AlertLogRow[]> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const res = await pool.query<AlertLogRow>(
    `
    SELECT id, reading_id, receiver_email, alert_type, message, sent_at
    FROM alert_logs
    ORDER BY sent_at DESC, id DESC
    LIMIT $1 OFFSET $2
  `,
    [limit, offset],
  );

  return res.rows;
}

// 4. Users & Auth Persistence
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const res = await pool.query<UserRow>(
    `SELECT id, full_name, email, password_hash, role, created_at, updated_at FROM users WHERE email = $1`,
    [email.toLowerCase().trim()],
  );

  return res.rows[0] || null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const res = await pool.query<UserRow>(
    `SELECT id, full_name, email, password_hash, role, created_at, updated_at FROM users WHERE id = $1`,
    [id],
  );

  return res.rows[0] || null;
}

export async function createUser(data: {
  full_name: string;
  email: string;
  password_hash: string;
  role?: "ADMIN" | "USER";
}): Promise<UserRow> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  // If first user, promote to ADMIN
  const countRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM users");
  const isFirstUser = parseInt(countRes.rows[0]?.count || "0", 10) === 0;
  const role = isFirstUser ? "ADMIN" : data.role || "USER";

  const userRes = await pool.query<UserRow>(
    `
    INSERT INTO users (full_name, email, password_hash, role, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING id, full_name, email, password_hash, role, created_at, updated_at
  `,
    [data.full_name.trim(), data.email.toLowerCase().trim(), data.password_hash, role],
  );

  const newUser = userRes.rows[0];

  // Also create default alert_settings for this user
  try {
    await pool.query(
      `
      INSERT INTO alert_settings (user_id, receiver_email, enable_email_alert, critical_threshold)
      VALUES ($1, $2, TRUE, 75.0)
      ON CONFLICT (user_id) DO NOTHING
    `,
      [newUser.id, newUser.email],
    );
  } catch (err) {
    console.warn("[Postgres] Failed to initialize default alert settings:", err);
  }

  return newUser;
}

export async function updateUserPassword(id: number, password_hash: string): Promise<boolean> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const res = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [password_hash, id],
  );

  return (res.rowCount ?? 0) > 0;
}

export async function getAlertSettingsByUserId(userId: number): Promise<AlertSettingRow | null> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const res = await pool.query<AlertSettingRow>(
    `SELECT id, user_id, receiver_email, enable_email_alert, critical_threshold FROM alert_settings WHERE user_id = $1`,
    [userId],
  );

  return res.rows[0] || null;
}

export async function querySensorReadingsForExport(options: {
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<SensorReadingRow[]> {
  await ensureDatabaseSchema();
  const pool = getPostgresPool();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status && options.status !== "ALL") {
    params.push(options.status.toUpperCase());
    conditions.push(`status = $${params.length}`);
  }

  if (options.startDate) {
    try {
      const startIso = new Date(options.startDate).toISOString();
      params.push(startIso);
      conditions.push(`timestamp >= $${params.length}`);
    } catch {
      // ignore invalid date
    }
  }

  if (options.endDate) {
    try {
      const endIso = new Date(options.endDate).toISOString();
      params.push(endIso);
      conditions.push(`timestamp <= $${params.length}`);
    } catch {
      // ignore invalid date
    }
  }

  if (options.minScore !== undefined && !isNaN(options.minScore)) {
    params.push(options.minScore);
    conditions.push(`pollution_score >= $${params.length}`);
  }

  if (options.maxScore !== undefined && !isNaN(options.maxScore)) {
    params.push(options.maxScore);
    conditions.push(`pollution_score <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const maxLimit = options.limit || 50000;
  params.push(maxLimit);

  const query = `
    SELECT id, timestamp, ph, tds, turbidity, temperature, flow_rate, pollution_score, status
    FROM sensor_readings
    ${whereClause}
    ORDER BY timestamp ASC, id ASC
    LIMIT $${params.length}
  `;

  const res = await pool.query<SensorReadingRow>(query, params);
  return res.rows;
}

export function formatSensorReadingsCsv(rows: SensorReadingRow[]): string {
  const headers = "timestamp,ph,tds,turbidity,temperature,flow_rate,pollution_score,status";
  const lines = rows.map((r) => {
    const ts =
      typeof r.timestamp === "string"
        ? r.timestamp
        : r.timestamp?.toISOString
          ? r.timestamp.toISOString()
          : String(r.timestamp);
    const ph = typeof r.ph === "number" ? Number(r.ph.toFixed(2)) : r.ph;
    const tds = typeof r.tds === "number" ? Math.round(r.tds) : r.tds;
    const turb = typeof r.turbidity === "number" ? Number(r.turbidity.toFixed(1)) : r.turbidity;
    const temp =
      typeof r.temperature === "number" ? Number(r.temperature.toFixed(1)) : r.temperature;
    const flow = typeof r.flow_rate === "number" ? Number(r.flow_rate.toFixed(2)) : r.flow_rate;
    const score =
      typeof r.pollution_score === "number" ? Math.round(r.pollution_score) : r.pollution_score;
    const status = (r.status || "SAFE").replace(/"/g, '""');
    return `"${ts}",${ph},${tds},${turb},${temp},${flow},${score},"${status}"`;
  });
  return [headers, ...lines].join("\n");
}
