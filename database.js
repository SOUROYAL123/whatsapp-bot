/**
 * DATABASE MODULE - PostgreSQL (FINAL CLEAN VERSION)
 */

const { Pool } = require('pg');

// Render Postgres URL
const connectionString =
  process.env.DATABASE_URL ||
  process.env.DB_POSTGRESDB_URL;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

/**
 * Initialize messages table (clients already exists)
 */
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      from_number VARCHAR(30),
      direction VARCHAR(10),
      body TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("🗄️  Database initialized (messages table ready)");
}

/**
 * Get all clients
 */
async function getClients() {
  const { rows } = await pool.query("SELECT * FROM clients ORDER BY id");
  return rows;
}

/**
 * Get one client by id
 */
async function getClientById(id) {
  const { rows } = await pool.query(
    "SELECT * FROM clients WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

/**
 * Default client (first row)
 */
async function getDefaultClient() {
  const { rows } = await pool.query(
    "SELECT * FROM clients ORDER BY id LIMIT 1"
  );
  return rows[0] || null;
}

/**
 * Map Twilio → client by whatsapp_number
 */
async function getClientByTwilioNumber(twilioNumber) {
  const { rows } = await pool.query(
    "SELECT * FROM clients WHERE whatsapp_number = $1 LIMIT 1",
    [twilioNumber]
  );
  return rows[0] || null;
}

/**
 * Update schedule fields for client
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
     SET open_hour         = COALESCE($2, open_hour),
         close_hour        = COALESCE($3, close_hour),
         daily_summary_time = COALESCE($4, daily_summary_time),
         timezone          = COALESCE($5, timezone),
         broadcast_message = COALESCE($6, broadcast_message),
         broadcast_time    = COALESCE($7, broadcast_time)
     WHERE id = $1
     RETURNING *`,
    [id, open_hour, close_hour, daily_summary_time, timezone, broadcast_message, broadcast_time]
  );

  return rows[0] || null;
}

/**
 * Log WhatsApp message
 */
async function logMessage({ client_id, from_number, direction, body }) {
  await pool.query(
    `INSERT INTO messages (client_id, from_number, direction, body)
     VALUES ($1, $2, $3, $4)`,
    [client_id, from_number, direction, body]
  );
}

/**
 * Summary for today
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
 * Leads for broadcast
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
