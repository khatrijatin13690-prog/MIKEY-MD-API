const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Add a PostgreSQL database and set DATABASE_URL.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inbound_messages (
      message_id TEXT PRIMARY KEY,
      from_number TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'unknown',
      message_text TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS inbound_messages_sender_idx
      ON inbound_messages(from_number, created_at DESC);

    CREATE TABLE IF NOT EXISTS saved_messages (
      id BIGSERIAL PRIMARY KEY,
      from_number TEXT NOT NULL,
      name TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      content_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(from_number, name)
    );

    CREATE TABLE IF NOT EXISTS api_message_logs (
      id BIGSERIAL PRIMARY KEY,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

module.exports = { pool, initDb };
