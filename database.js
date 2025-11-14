/**
 * DATABASE MODULE - PostgreSQL (FIXED)
 */

// database.js

const { Pool } = require('pg');

// Use your Render Postgres URL
const connectionString =
  process.env.DATABASE_URL || // if using DATABASE_URL
  process.env.DB_POSTGRESDB_URL; // fallback to existing var

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

/**
 * Initialize database tables if they don't exist
 * Call this ONCE on server startup.
 */
async function initDatabase() {
  // CLIENTS TABLE: one row = one restaurant
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      business_name VARCHAR(100) NOT NULL,
      phone VARCHAR(30),  -- owner's WhatsApp or Twilio "to" number mapping
      ai_instructions TEXT,
      open_hour INTEGER DEFAULT 12,       -- 12 = 12:00
      close_hour INTEGER DEFAULT 22,      -- 22 = 22:00
      daily_summary_time VARCHAR(5) DEFAULT '22:30', -- "HH:MM" 24h
      timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
      broadcast_message TEXT,
      broadcast_time VARCHAR(5)           -- "HH:MM" 24h
    );
  `);

  // MESSAGES TABLE: all WhatsApp in/out for analytics
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      from_number VARCHAR(30),
      direction VARCHAR(10),         -- 'inbound' or 'outbound'
      body TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('🗄️  Database initialized');
}

/**
 * Get all clients (restaurants)
 */
async function getClients() {
  const { rows } = await pool.query('SELECT * FROM clients ORDER BY id');
  return rows;
}

/**
 * Get one client by id
 */
async function getClientById(id) {
  const { rows } = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
  return rows[0] || null;
}

/**
 * Get default client (first row)
 * Used if you only have one restaurant for now.
 */
async function getDefaultClient() {
  const { rows } = await pool.query('SELECT * FROM clients ORDER BY id LIMIT 1');
  return rows[0] || null;
}

/**
 * Map Twilio "to" number to a client (for multi-restaurant future)
 * For now, you can ignore and just use getDefaultClient().
 */
async function getClientByTwilioNumber(twilioNumber) {
  const { rows } = await pool.query(
    'SELECT * FROM clients WHERE phone = $1 LIMIT 1',
    [twilioNumber]
  );
  return rows[0] || null;
}

/**
 * Update scheduling fields for a client
 */
async function updateClientSchedule(id, schedule) {
  const {
    open_hour,
    close_hour,
    daily_summary_time,
    timezone,
    broadcast_message,
    broadcast_time
  } = schedule;

  const { rows } = await pool.query(
    `UPDATE clients
     SET open_hour = COALESCE($2, open_hour),
         close_hour = COALESCE($3, close_hour),
         daily_summary_time = COALESCE($4, daily_summary_time),
         timezone = COALESCE($5, timezone),
         broadcast_message = COALESCE($6, broadcast_message),
         broadcast_time = COALESCE($7, broadcast_time)
     WHERE id = $1
     RETURNING *`,
    [id, open_hour, close_hour, daily_summary_time, timezone, broadcast_message, broadcast_time]
  );

  return rows[0] || null;
}

/**
 * Log every WhatsApp message for analytics
 */
async function logMessage({ client_id, from_number, direction, body }) {
  await pool.query(
    `INSERT INTO messages (client_id, from_number, direction, body)
     VALUES ($1, $2, $3, $4)`,
    [client_id, from_number, direction, body]
  );
}

/**
 * Simple daily summary (for today)
 */
async function getTodaySummary(client_id) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::INT AS total_messages,
       COUNT(*) FILTER (WHERE direction = 'inbound')::INT AS inbound_count,
       COUNT(*) FILTER (WHERE direction = 'outbound')::INT AS outbound_count
     FROM messages
     WHERE client_id = $1
       AND created_at::date = CURRENT_DATE`,
    [client_id]
  );
  return rows[0];
}

/**
 * Leads = unique inbound numbers last 30 days
 * Used for promos/broadcasts.
 */
async function getLeads(client_id) {
  const { rows } = await pool.query(
    `SELECT DISTINCT from_number AS phone
     FROM messages
     WHERE client_id = $1
       AND direction = 'inbound'
       AND created_at >= NOW() - INTERVAL '30 days'`,
    [client_id]
  );
  return rows;
}

module.exports = {
  initDatabase,
  getClients,
  getClientById,
  getDefaultClient,
  getClientByTwilioNumber,
  updateClientSchedule,
  logMessage,
  getTodaySummary,
  getLeads
};

