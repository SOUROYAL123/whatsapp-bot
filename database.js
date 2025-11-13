/**
 * DATABASE MODULE - PostgreSQL
 */

const { Pool } = require('pg');

let pool = null;

async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not configured!');
    throw new Error('DATABASE_URL required');
  }

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // Test connection
  try {
    const client = await pool.connect();
    console.log('✅ Database connection established');
    client.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }

  // Create tables
  await createTables();
}

async function createTables() {
  const createClientsTable = `
    CREATE TABLE IF NOT EXISTS clients (
      client_id VARCHAR(100) PRIMARY KEY,
      business_name VARCHAR(255) NOT NULL,
      whatsapp_number VARCHAR(50) NOT NULL,
      ai_instructions TEXT,
      language VARCHAR(10) DEFAULT 'en',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createMessagesTable = `
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      phone_number VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      sender VARCHAR(20) NOT NULL,
      client_id VARCHAR(100) DEFAULT 'default',
      language VARCHAR(10) DEFAULT 'en',
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone_client (phone_number, client_id),
      INDEX idx_timestamp (timestamp)
    );
  `;

  try {
    await pool.query(createClientsTable);
    await pool.query(createMessagesTable);
    console.log('✅ Database tables ready');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
  }
}

async function saveMessage(phoneNumber, message, sender, clientId = 'default', language = 'en') {
  try {
    await pool.query(
      'INSERT INTO messages (phone_number, message, sender, client_id, language) VALUES ($1, $2, $3, $4, $5)',
      [phoneNumber, message, sender, clientId, language]
    );
  } catch (error) {
    console.error('Error saving message:', error);
  }
}

async function getConversationHistory(phoneNumber, clientId = 'default', limit = 5) {
  try {
    const result = await pool.query(
      'SELECT message, sender, timestamp FROM messages WHERE phone_number = $1 AND client_id = $2 ORDER BY timestamp DESC LIMIT $3',
      [phoneNumber, clientId, limit]
    );
    return result.rows.reverse();
  } catch (error) {
    console.error('Error getting conversation history:', error);
    return [];
  }
}

async function addClient(clientId, businessName, whatsappNumber, aiInstructions = null, language = 'en') {
  try {
    await pool.query(
      'INSERT INTO clients (client_id, business_name, whatsapp_number, ai_instructions, language) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (client_id) DO UPDATE SET business_name = $2, whatsapp_number = $3, ai_instructions = $4, language = $5',
      [clientId, businessName, whatsappNumber, aiInstructions, language]
    );
    return { success: true };
  } catch (error) {
    console.error('Error adding client:', error);
    return { success: false, error: error.message };
  }
}

async function getClient(clientId) {
  try {
    const result = await pool.query(
      'SELECT * FROM clients WHERE client_id = $1',
      [clientId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error getting client:', error);
    return null;
  }
}

async function getAllClients() {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
    return result.rows;
  } catch (error) {
    console.error('Error getting clients:', error);
    return [];
  }
}

async function updateAnalytics(clientId, isIncoming) {
  // Placeholder for analytics
  return;
}

module.exports = {
  initDatabase,
  saveMessage,
  getConversationHistory,
  addClient,
  getClient,
  getAllClients,
  updateAnalytics
};
