/**
 * DATABASE MODULE
 * PostgreSQL integration optimized for Render.com
 */

const { Pool } = require('pg');

// Create connection pool with Render-optimized settings
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Initialize database tables and indexes
 */
async function initDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Initializing database...');

    // Create conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        phone_number VARCHAR(20) NOT NULL,
        client_id VARCHAR(100) DEFAULT 'default',
        message TEXT NOT NULL,
        sender VARCHAR(10) NOT NULL CHECK (sender IN ('user', 'assistant')),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        language VARCHAR(10) DEFAULT 'en'
      )
    `);

    // Create clients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(100) UNIQUE NOT NULL,
        business_name VARCHAR(200) NOT NULL,
        whatsapp_number VARCHAR(20) NOT NULL,
        ai_instructions TEXT,
        language VARCHAR(10) DEFAULT 'en',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create analytics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        client_id VARCHAR(100) NOT NULL,
        date DATE DEFAULT CURRENT_DATE,
        total_messages INT DEFAULT 0,
        user_messages INT DEFAULT 0,
        bot_messages INT DEFAULT 0,
        unique_users INT DEFAULT 0,
        UNIQUE(client_id, date)
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_phone_timestamp 
      ON conversations(phone_number, timestamp DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_client_id 
      ON conversations(client_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_active_clients 
      ON clients(active) WHERE active = true
    `);

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Save a conversation message
 */
async function saveMessage(phoneNumber, message, sender, clientId = 'default', language = 'en') {
  const client = await pool.connect();
  
  try {
    await client.query(
      'INSERT INTO conversations (phone_number, client_id, message, sender, language) VALUES ($1, $2, $3, $4, $5)',
      [phoneNumber, clientId, message, sender, language]
    );
  } catch (error) {
    console.error('❌ Error saving message:', error);
  } finally {
    client.release();
  }
}

/**
 * Get conversation history for a phone number
 */
async function getConversationHistory(phoneNumber, clientId = 'default', limit = 10) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT message, sender, timestamp, language
       FROM conversations 
       WHERE phone_number = $1 AND client_id = $2 
       ORDER BY timestamp DESC 
       LIMIT $3`,
      [phoneNumber, clientId, limit]
    );
    
    return result.rows.reverse();
  } catch (error) {
    console.error('❌ Error getting conversation history:', error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Add or update a client
 */
async function addClient(clientId, businessName, whatsappNumber, aiInstructions = null, language = 'en') {
  const client = await pool.connect();
  
  try {
    await client.query(
      `INSERT INTO clients (client_id, business_name, whatsapp_number, ai_instructions, language) 
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id) 
       DO UPDATE SET 
         business_name = $2, 
         whatsapp_number = $3, 
         ai_instructions = $4, 
         language = $5,
         updated_at = CURRENT_TIMESTAMP`,
      [clientId, businessName, whatsappNumber, aiInstructions, language]
    );
    console.log(`✅ Client ${businessName} (${clientId}) added/updated successfully`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error adding client:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

/**
 * Get client configuration
 */
async function getClient(clientId) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT * FROM clients WHERE client_id = $1 AND active = true',
      [clientId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error getting client:', error);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Get all active clients
 */
async function getAllClients() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      'SELECT * FROM clients WHERE active = true ORDER BY created_at DESC'
    );
    return result.rows;
  } catch (error) {
    console.error('❌ Error getting all clients:', error);
    return [];
  } finally {
    client.release();
  }
}

/**
 * Update analytics
 */
async function updateAnalytics(clientId, isUserMessage) {
  const client = await pool.connect();
  
  try {
    const updateField = isUserMessage ? 'user_messages' : 'bot_messages';
    
    await client.query(
      `INSERT INTO analytics (client_id, date, total_messages, ${updateField})
       VALUES ($1, CURRENT_DATE, 1, 1)
       ON CONFLICT (client_id, date)
       DO UPDATE SET 
         total_messages = analytics.total_messages + 1,
         ${updateField} = analytics.${updateField} + 1`,
      [clientId]
    );
  } catch (error) {
    console.error('❌ Error updating analytics:', error);
  } finally {
    client.release();
  }
}

/**
 * Get analytics for a client
 */
async function getAnalytics(clientId, days = 7) {
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT date, total_messages, user_messages, bot_messages
       FROM analytics
       WHERE client_id = $1 AND date >= CURRENT_DATE - $2
       ORDER BY date DESC`,
      [clientId, days]
    );
    return result.rows;
  } catch (error) {
    console.error('❌ Error getting analytics:', error);
    return [];
  } finally {
    client.release();
  }
}

// Test database connection
pool.on('connect', () => {
  console.log('✅ Database connection established');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

module.exports = {
  pool,
  initDatabase,
  saveMessage,
  getConversationHistory,
  addClient,
  getClient,
  getAllClients,
  updateAnalytics,
  getAnalytics
};
