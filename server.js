/**
 * WHATSAPP AI CHATBOT SERVER - GEMINI ONLY
 * Simple, clean, production-ready
 */

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Import modules
const { 
  initTwilio, 
  sendWhatsAppMessage, 
  parseIncomingMessage, 
  checkRateLimit,
  getRateLimitStatus 
} = require('./whatsapp');

const { 
  getAIResponse, 
  detectLanguage,
  validateAPIConfig
} = require('./ai');

const { 
  initDatabase, 
  saveMessage, 
  getConversationHistory, 
  addClient, 
  getClient,
  getAllClients,
  updateAnalytics 
} = require('./database');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'WhatsApp AI Chatbot',
    version: '1.0.0',
    aiProvider: 'Google Gemini',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// WEBHOOK - MAIN ENDPOINT
// ============================================

app.post('/webhook', async (req, res) => {
  try {
    const incomingMessage = parseIncomingMessage(req);
    
    if (!incomingMessage) {
      return res.status(400).send('Invalid message');
    }

    const { phoneNumber, body: messageText, numMedia, profileName } = incomingMessage;
    
    console.log(`\n📩 NEW MESSAGE`);
    console.log(`   From: ${profileName} (${phoneNumber})`);
    console.log(`   Text: "${messageText}"`);

    // Rate limit check
    const rateLimit = parseInt(process.env.RATE_LIMIT) || 50;
    if (!checkRateLimit(phoneNumber, rateLimit)) {
      const language = detectLanguage(messageText);
      const limitMsg = language === 'bn'
        ? '⚠️ দুঃখিত, আপনি অনেকগুলি বার্তা পাঠিয়েছেন। ১ ঘন্টা পরে চেষ্টা করুন।'
        : '⚠️ Too many messages. Please try again in 1 hour.';
      
      await sendWhatsAppMessage(incomingMessage.from, limitMsg);
      return res.status(429).send('Rate limit exceeded');
    }

    // Handle media
    if (numMedia > 0) {
      const language = detectLanguage(messageText);
      const mediaMsg = language === 'bn'
        ? '🖼️ দুঃখিত, আমি ছবি প্রক্রিয়া করতে পারি না। টেক্সট পাঠান।'
        : '🖼️ Sorry, I cannot process images. Please send text.';
      
      await sendWhatsAppMessage(incomingMessage.from, mediaMsg);
      return res.status(200).send('OK');
    }

    // Skip empty messages
    if (!messageText || messageText.trim() === '') {
      return res.status(200).send('OK');
    }

    // Get client config
    const clientId = 'default';
    const clientConfig = await getClient(clientId) || {};

    // Save incoming message
    await saveMessage(phoneNumber, messageText, 'user', clientId);

    // Get conversation history
    const history = await getConversationHistory(phoneNumber, clientId, 5);

    // Generate AI response
    console.log(`🤖 Generating response...`);
    const aiResult = await getAIResponse(messageText, history, clientConfig);

    const responseText = aiResult.response;
    console.log(`💬 Response: "${responseText.substring(0, 100)}..."`);

    // Save AI response
    await saveMessage(phoneNumber, responseText, 'assistant', clientId, aiResult.language);

    // Send via WhatsApp
    const sendResult = await sendWhatsAppMessage(incomingMessage.from, responseText);

    if (sendResult.success) {
      console.log(`✅ Message delivered\n`);
    } else {
      console.error(`❌ Failed to deliver\n`);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).send('Error');
  }
});

// ============================================
// ADMIN API
// ============================================

app.post('/admin/add-client', async (req, res) => {
  try {
    const { clientId, businessName, whatsappNumber, aiInstructions, language } = req.body;

    if (!clientId || !businessName || !whatsappNumber) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const result = await addClient(clientId, businessName, whatsappNumber, aiInstructions, language || 'en');

    res.json(result.success 
      ? { success: true, message: `Client ${businessName} added` }
      : { success: false, error: result.error }
    );

  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to add client' });
  }
});

app.get('/admin/clients', async (req, res) => {
  try {
    const clients = await getAllClients();
    res.json({ success: true, count: clients.length, clients });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch clients' });
  }
});

app.get('/admin/conversations/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const clientId = req.query.clientId || 'default';

    const history = await getConversationHistory(phoneNumber, clientId, limit);

    res.json({
      success: true,
      phoneNumber,
      messageCount: history.length,
      messages: history
    });

  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch conversations' });
  }
});

app.post('/admin/send-message', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const formattedNumber = phoneNumber.startsWith('whatsapp:') 
      ? phoneNumber 
      : `whatsapp:${phoneNumber}`;

    const result = await sendWhatsAppMessage(formattedNumber, message);

    if (result.success) {
      await saveMessage(phoneNumber.replace('whatsapp:', ''), message, 'assistant', 'default');
      res.json({ success: true, messageSid: result.sid });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }

  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// ============================================
// ADMIN DASHBOARD (HTML)
// ============================================

app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WhatsApp Bot Admin - Gemini</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
        }
        .container { 
          max-width: 1200px; 
          margin: 0 auto; 
          background: white;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 { 
          color: #25D366; 
          margin-bottom: 10px;
          font-size: 2em;
        }
        .badge {
          background: #4285F4;
          color: white;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.8em;
          font-weight: 600;
          margin-left: 10px;
        }
        .subtitle { 
          color: #666; 
          margin-bottom: 30px;
          font-size: 1.1em;
        }
        .section { 
          background: #f8f9fa; 
          margin: 20px 0; 
          padding: 25px; 
          border-radius: 12px;
          border-left: 4px solid #25D366;
        }
        h2 { 
          color: #333; 
          margin-bottom: 20px;
          font-size: 1.4em;
        }
        input, textarea, select { 
          width: 100%; 
          padding: 12px; 
          margin: 8px 0; 
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
        }
        input:focus, textarea:focus { 
          outline: none; 
          border-color: #25D366; 
        }
        button { 
          background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
          color: white; 
          padding: 12px 24px; 
          border: none; 
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          margin-top: 10px;
        }
        button:hover { 
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(37, 211, 102, 0.4);
        }
        .success { 
          color: #25D366; 
          padding: 12px;
          background: #e8f5e9;
          border-radius: 8px;
          margin-top: 10px;
        }
        .error { 
          color: #d32f2f; 
          padding: 12px;
          background: #ffebee;
          border-radius: 8px;
          margin-top: 10px;
        }
        .client-card {
          background: white;
          padding: 20px;
          margin: 15px 0;
          border-radius: 12px;
          border: 2px solid #e0e0e0;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 2px solid #e0e0e0;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 WhatsApp AI Admin<span class="badge">🔶 Google Gemini</span></h1>
        <p class="subtitle">Simple, Fast, Free AI-powered WhatsApp assistant</p>
        
        <div class="section">
          <h2>➕ Add New Client</h2>
          <form id="addClientForm">
            <input type="text" id="clientId" placeholder="Client ID (e.g., cafe-123)" required>
            <input type="text" id="businessName" placeholder="Business Name" required>
            <input type="text" id="whatsappNumber" placeholder="WhatsApp (+919876543210)" required>
            <textarea id="aiInstructions" placeholder="AI Instructions (optional)" rows="3"></textarea>
            <select id="language">
              <option value="en">English</option>
              <option value="bn">Bengali (বাংলা)</option>
            </select>
            <button type="submit">Add Client</button>
          </form>
          <div id="addResult"></div>
        </div>

        <div class="section">
          <h2>👥 All Clients</h2>
          <button onclick="loadClients()">🔄 Refresh</button>
          <div id="clientsList"></div>
        </div>

        <div class="section">
          <h2>📤 Send Test Message</h2>
          <form id="sendForm">
            <input type="text" id="phone" placeholder="Phone (+919876543210)" required>
            <textarea id="msg" placeholder="Message" rows="3" required></textarea>
            <button type="submit">Send</button>
          </form>
          <div id="sendResult"></div>
        </div>

        <div class="section">
          <h2>💬 View Conversations</h2>
          <form id="convForm">
            <input type="text" id="convPhone" placeholder="Phone (+919876543210)" required>
            <button type="submit">Load</button>
          </form>
          <div id="convResult"></div>
        </div>

        <div class="footer">
          <p>🚀 Powered by Render | 🔶 Google Gemini (FREE) | 📱 Twilio WhatsApp</p>
          <p style="margin-top: 10px;">Made for your business success 💚</p>
        </div>
      </div>

      <script>
        window.addEventListener('load', loadClients);

        document.getElementById('addClientForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const result = document.getElementById('addResult');
          result.innerHTML = '⏳ Adding...';
          
          try {
            const response = await fetch('/admin/add-client', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clientId: document.getElementById('clientId').value,
                businessName: document.getElementById('businessName').value,
                whatsappNumber: document.getElementById('whatsappNumber').value,
                aiInstructions: document.getElementById('aiInstructions').value,
                language: document.getElementById('language').value
              })
            });
            const json = await response.json();
            
            if (json.success) {
              result.innerHTML = '<div class="success">✅ ' + json.message + '</div>';
              e.target.reset();
              loadClients();
            } else {
              result.innerHTML = '<div class="error">❌ ' + json.error + '</div>';
            }
          } catch (error) {
            result.innerHTML = '<div class="error">❌ Error: ' + error.message + '</div>';
          }
        });

        async function loadClients() {
          const container = document.getElementById('clientsList');
          container.innerHTML = '⏳ Loading...';

          try {
            const response = await fetch('/admin/clients');
            const json = await response.json();
            
            if (json.success && json.clients.length > 0) {
              container.innerHTML = json.clients.map(c => \`
                <div class="client-card">
                  <h3>\${c.business_name}</h3>
                  <p><strong>ID:</strong> \${c.client_id}</p>
                  <p><strong>WhatsApp:</strong> \${c.whatsapp_number}</p>
                  <p><strong>Language:</strong> \${c.language === 'bn' ? 'Bengali' : 'English'}</p>
                </div>
              \`).join('');
            } else {
              container.innerHTML = '<p>No clients yet</p>';
            }
          } catch (error) {
            container.innerHTML = '<div class="error">❌ Error loading</div>';
          }
        }

        document.getElementById('sendForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const result = document.getElementById('sendResult');
          result.innerHTML = '⏳ Sending...';
          
          try {
            const response = await fetch('/admin/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phoneNumber: document.getElementById('phone').value,
                message: document.getElementById('msg').value
              })
            });
            const json = await response.json();
            
            if (json.success) {
              result.innerHTML = '<div class="success">✅ Sent!</div>';
              e.target.reset();
            } else {
              result.innerHTML = '<div class="error">❌ ' + json.error + '</div>';
            }
          } catch (error) {
            result.innerHTML = '<div class="error">❌ Error: ' + error.message + '</div>';
          }
        });

        document.getElementById('convForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const result = document.getElementById('convResult');
          result.innerHTML = '⏳ Loading...';
          
          const phone = document.getElementById('convPhone').value;

          try {
            const response = await fetch(\`/admin/conversations/\${phone.replace('+', '')}\`);
            const json = await response.json();
            
            if (json.success && json.messages.length > 0) {
              result.innerHTML = \`
                <h3>Messages: \${json.messageCount}</h3>
                <div style="max-height: 400px; overflow-y: auto; margin-top: 15px;">
                  \${json.messages.map(m => \`
                    <div style="margin: 10px 0; padding: 10px; background: \${m.sender === 'user' ? '#e3f2fd' : '#f1f8e9'}; border-radius: 8px;">
                      <strong>\${m.sender === 'user' ? '👤 User' : '🤖 Bot'}:</strong>
                      <p>\${m.message}</p>
                      <small>\${new Date(m.timestamp).toLocaleString()}</small>
                    </div>
                  \`).join('')}
                </div>
              \`;
            } else {
              result.innerHTML = '<p>No messages found</p>';
            }
          } catch (error) {
            result.innerHTML = '<div class="error">❌ Error loading</div>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// ============================================
// START SERVER
// ============================================

async function startServer() {
  try {
    console.log('\n🚀 Starting WhatsApp AI Chatbot...\n');
    
    // Validate config
    if (!validateAPIConfig()) {
      throw new Error('Gemini API key not configured');
    }
    
    // Initialize Twilio
    console.log('📱 Initializing Twilio...');
    initTwilio();
    
    // Initialize Database
    console.log('🗄️  Initializing Database...');
    await initDatabase();
    
    // Add default client
    console.log('👤 Setting up default client...');
    await addClient(
      'default',
      process.env.BUSINESS_NAME || 'Demo Business',
      process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886',
      null,
      'en'
    );

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n✅ Server started!\n');
      console.log('═══════════════════════════════════════');
      console.log(`🌐 Port: ${PORT}`);
      console.log(`🤖 AI: Google Gemini (FREE!)`);
      console.log(`📱 Webhook: /webhook`);
      console.log(`⚙️  Admin: /admin`);
      console.log('═══════════════════════════════════════');
      console.log('\n💚 Ready for WhatsApp messages!\n');
    });

  } catch (error) {
    console.error('\n❌ Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 Shutting down...');
  process.exit(0);
});

// Start
startServer();
