/**
 * WHATSAPP AI CHATBOT SERVER
 * Optimized for Render.com deployment with OpenAI/Claude/Gemini support
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
  getWelcomeMessage,
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

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// HEALTH & STATUS ENDPOINTS
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'WhatsApp AI Chatbot',
    version: '2.0.0',
    platform: 'Render.com',
    aiProviders: ['OpenAI', 'Claude', 'Google Gemini'],
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      webhook: '/webhook',
      admin: '/admin'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    aiProvider: process.env.AI_PROVIDER || 'openai'
  });
});

// ============================================
// MAIN WEBHOOK ENDPOINT
// ============================================

app.post('/webhook', async (req, res) => {
  try {
    const incomingMessage = parseIncomingMessage(req);
    
    if (!incomingMessage) {
      console.error('Failed to parse incoming message');
      return res.status(400).send('Invalid message format');
    }

    const { phoneNumber, body: messageText, numMedia, profileName } = incomingMessage;
    
    console.log(`\n📩 NEW MESSAGE`);
    console.log(`   From: ${profileName} (${phoneNumber})`);
    console.log(`   Text: "${messageText}"`);

    // Check rate limit
    const rateLimit = parseInt(process.env.RATE_LIMIT) || 50;
    if (!checkRateLimit(phoneNumber, rateLimit)) {
      const language = detectLanguage(messageText);
      const limitMessage = language === 'bn'
        ? '⚠️ দুঃখিত, আপনি অনেকগুলি বার্তা পাঠিয়েছেন। অনুগ্রহ করে ১ ঘন্টা পরে আবার চেষ্টা করুন।'
        : '⚠️ Sorry, you have exceeded the message limit. Please try again in 1 hour.';
      
      await sendWhatsAppMessage(incomingMessage.from, limitMessage);
      return res.status(429).send('Rate limit exceeded');
    }

    // Handle media messages
    if (numMedia > 0) {
      const language = detectLanguage(messageText);
      const mediaResponse = language === 'bn'
        ? '🖼️ দুঃখিত, আমি এখনও ছবি বা ভিডিও প্রক্রিয়া করতে পারি না। অনুগ্রহ করে আপনার প্রশ্ন টেক্সটে লিখুন।'
        : '🖼️ Sorry, I cannot process images or videos yet. Please send your question as text.';
      
      await sendWhatsAppMessage(incomingMessage.from, mediaResponse);
      return res.status(200).send('OK');
    }

    // Skip empty messages
    if (!messageText || messageText.trim() === '') {
      return res.status(200).send('OK');
    }

    // Get client configuration
    const clientId = 'default';
    const clientConfig = await getClient(clientId) || {};

    // Save incoming message
    await saveMessage(phoneNumber, messageText, 'user', clientId);
    await updateAnalytics(clientId, true);

    // Get conversation history
    const history = await getConversationHistory(phoneNumber, clientId, 5);

    // Generate AI response
    console.log(`🤖 Generating AI response using ${process.env.AI_PROVIDER || 'OpenAI'}...`);
    const aiResult = await getAIResponse(messageText, history, clientConfig);

    const responseText = aiResult.response;
    console.log(`💬 Response: "${responseText.substring(0, 100)}..."`);

    // Save AI response
    await saveMessage(phoneNumber, responseText, 'assistant', clientId, aiResult.language);
    await updateAnalytics(clientId, false);

    // Send response via WhatsApp
    const sendResult = await sendWhatsAppMessage(incomingMessage.from, responseText);

    if (sendResult.success) {
      console.log(`✅ Message delivered successfully\n`);
    } else {
      console.error(`❌ Failed to deliver message\n`);
    }

    // Respond to Twilio with 200 OK
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error in webhook:', error);
    res.status(500).send('Internal server error');
  }
});

// ============================================
// ADMIN API ENDPOINTS
// ============================================

app.post('/admin/add-client', async (req, res) => {
  try {
    const { clientId, businessName, whatsappNumber, aiInstructions, language } = req.body;

    if (!clientId || !businessName || !whatsappNumber) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields' 
      });
    }

    const result = await addClient(
      clientId, 
      businessName, 
      whatsappNumber, 
      aiInstructions, 
      language || 'en'
    );

    if (result.success) {
      res.json({ 
        success: true, 
        message: `Client ${businessName} added successfully`,
        clientId: clientId
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('Error adding client:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to add client' 
    });
  }
});

app.get('/admin/clients', async (req, res) => {
  try {
    const clients = await getAllClients();
    
    res.json({
      success: true,
      count: clients.length,
      clients: clients
    });

  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch clients' 
    });
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
      clientId,
      messageCount: history.length,
      messages: history
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch conversations' 
    });
  }
});

app.post('/admin/send-message', async (req, res) => {
  try {
    const { phoneNumber, message, clientId } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing phoneNumber or message' 
      });
    }

    const formattedNumber = phoneNumber.startsWith('whatsapp:') 
      ? phoneNumber 
      : `whatsapp:${phoneNumber}`;

    const result = await sendWhatsAppMessage(formattedNumber, message);

    if (result.success) {
      await saveMessage(
        phoneNumber.replace('whatsapp:', ''), 
        message, 
        'assistant', 
        clientId || 'default'
      );

      res.json({ 
        success: true, 
        messageSid: result.sid 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to send message' 
    });
  }
});

app.get('/admin/rate-limit/:phoneNumber', (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const status = getRateLimitStatus(phoneNumber);
    
    res.json({
      success: true,
      phoneNumber,
      rateLimit: status
    });

  } catch (error) {
    console.error('Error getting rate limit status:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get rate limit status' 
    });
  }
});

// ============================================
// AI PROVIDER SWITCHING ENDPOINT
// ============================================

app.post('/admin/switch-provider', (req, res) => {
  try {
    const { provider } = req.body;
    
    const validProviders = ['openai', 'anthropic', 'gemini'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        success: false,
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`
      });
    }

    // Note: This changes it for current session only
    // For permanent change, update environment variable in Render
    process.env.AI_PROVIDER = provider;

    res.json({
      success: true,
      message: `AI provider switched to ${provider}`,
      note: 'This change is temporary. Update AI_PROVIDER env variable in Render for permanent change.'
    });

  } catch (error) {
    console.error('Error switching provider:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to switch provider'
    });
  }
});

// ============================================
// ADMIN DASHBOARD (HTML)
// ============================================

app.get('/admin', (req, res) => {
  const currentProvider = process.env.AI_PROVIDER || 'openai';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WhatsApp Chatbot Admin - Render</title>
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
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 2em;
        }
        .subtitle { 
          color: #666; 
          margin-bottom: 30px;
          font-size: 1.1em;
        }
        .badge {
          background: #667eea;
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.8em;
          font-weight: 600;
        }
        .provider-badge {
          background: #4CAF50;
          color: white;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 0.85em;
          font-weight: 600;
          margin-left: 10px;
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
          transition: border-color 0.3s;
        }
        input:focus, textarea:focus, select:focus {
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
          transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover { 
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(37, 211, 102, 0.4);
        }
        button:active { transform: translateY(0); }
        .success { 
          color: #25D366; 
          padding: 12px;
          background: #e8f5e9;
          border-radius: 8px;
          margin-top: 10px;
          border-left: 4px solid #25D366;
        }
        .error { 
          color: #d32f2f; 
          padding: 12px;
          background: #ffebee;
          border-radius: 8px;
          margin-top: 10px;
          border-left: 4px solid #d32f2f;
        }
        .client-card {
          background: white;
          padding: 20px;
          margin: 15px 0;
          border-radius: 12px;
          border: 2px solid #e0e0e0;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .client-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }
        .client-card h3 {
          color: #333;
          margin-bottom: 10px;
        }
        .client-card p {
          color: #666;
          font-size: 14px;
          margin: 6px 0;
        }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 10px;
        }
        .status-active { background: #e8f5e9; color: #2e7d32; }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 2px solid #e0e0e0;
          color: #666;
        }
        .provider-selector {
          display: flex;
          gap: 10px;
          margin: 15px 0;
        }
        .provider-btn {
          padding: 10px 20px;
          border: 2px solid #e0e0e0;
          background: white;
          cursor: pointer;
          border-radius: 8px;
          font-weight: 600;
          transition: all 0.3s;
        }
        .provider-btn:hover {
          border-color: #25D366;
          transform: translateY(-2px);
        }
        .provider-btn.active {
          background: #25D366;
          color: white;
          border-color: #25D366;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>
          📱 WhatsApp AI Chatbot Admin
          <span class="badge">Render</span>
          <span class="provider-badge" id="currentProvider">🤖 ${currentProvider.toUpperCase()}</span>
        </h1>
        <p class="subtitle">Manage your AI-powered WhatsApp business assistant</p>
        
        <div class="section">
          <h2>🤖 AI Provider Settings</h2>
          <p style="margin-bottom: 15px; color: #666;">Current: <strong id="providerDisplay">${currentProvider.toUpperCase()}</strong></p>
          <div class="provider-selector">
            <button class="provider-btn ${currentProvider === 'openai' ? 'active' : ''}" onclick="switchProvider('openai')">
              🔷 OpenAI GPT-3.5
            </button>
            <button class="provider-btn ${currentProvider === 'anthropic' ? 'active' : ''}" onclick="switchProvider('anthropic')">
              🟣 Claude Sonnet
            </button>
            <button class="provider-btn ${currentProvider === 'gemini' ? 'active' : ''}" onclick="switchProvider('gemini')">
              🔶 Google Gemini
            </button>
          </div>
          <div id="providerResult"></div>
          <p style="margin-top: 10px; font-size: 0.9em; color: #999;">
            ⚠️ Note: Provider change is temporary. For permanent change, update AI_PROVIDER in Render environment variables.
          </p>
        </div>

        <div class="section">
          <h2>➕ Add New Client</h2>
          <form id="addClientForm">
            <input type="text" id="clientId" placeholder="Client ID (e.g., cafe-abc)" required>
            <input type="text" id="businessName" placeholder="Business Name" required>
            <input type="text" id="whatsappNumber" placeholder="WhatsApp Number (+919876543210)" required>
            <textarea id="aiInstructions" placeholder="AI Instructions (optional)" rows="4"></textarea>
            <select id="language">
              <option value="en">English</option>
              <option value="bn">Bengali (বাংলা)</option>
            </select>
            <button type="submit">Add Client</button>
          </form>
          <div id="addClientResult"></div>
        </div>

        <div class="section">
          <h2>👥 All Clients</h2>
          <button onclick="loadClients()">🔄 Refresh Client List</button>
          <div id="clientsList"></div>
        </div>

        <div class="section">
          <h2>📤 Send Message</h2>
          <form id="sendMessageForm">
            <input type="text" id="phoneNumber" placeholder="Phone Number (+919876543210)" required>
            <textarea id="message" placeholder="Message to send" rows="3" required></textarea>
            <button type="submit">Send Message</button>
          </form>
          <div id="sendMessageResult"></div>
        </div>

        <div class="section">
          <h2>💬 View Conversations</h2>
          <form id="viewConversationsForm">
            <input type="text" id="conversationPhone" placeholder="Phone Number (+919876543210)" required>
            <input type="number" id="conversationLimit" placeholder="Number of messages" value="50">
            <button type="submit">Load Conversations</button>
          </form>
          <div id="conversationsResult"></div>
        </div>

        <div class="footer">
          <p>🚀 Powered by Render.com | 🤖 OpenAI • Claude • Gemini | 📱 Twilio WhatsApp API</p>
          <p style="margin-top: 10px; font-size: 0.9em;">Made with ❤️ for your business success</p>
        </div>
      </div>

      <script>
        window.addEventListener('load', loadClients);

        async function switchProvider(provider) {
          const result = document.getElementById('providerResult');
          result.innerHTML = '⏳ Switching provider...';

          try {
            const response = await fetch('/admin/switch-provider', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider })
            });
            const json = await response.json();

            if (json.success) {
              result.innerHTML = '<div class="success">✅ ' + json.message + '</div>';
              document.getElementById('currentProvider').textContent = '🤖 ' + provider.toUpperCase();
              document.getElementById('providerDisplay').textContent = provider.toUpperCase();
              
              // Update button states
              document.querySelectorAll('.provider-btn').forEach(btn => {
                btn.classList.remove('active');
              });
              event.target.classList.add('active');
            } else {
              result.innerHTML = '<div class="error">❌ ' + json.error + '</div>';
            }
          } catch (error) {
            result.innerHTML = '<div class="error">❌ Error: ' + error.message + '</div>';
          }
        }

        document.getElementById('addClientForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const result = document.getElementById('addClientResult');
          result.innerHTML = '⏳ Adding client...';
          
          const data = {
            clientId: document.getElementById('clientId').value,
            businessName: document.getElementById('businessName').value,
            whatsappNumber: document.getElementById('whatsappNumber').value,
            aiInstructions: document.getElementById('aiInstructions').value,
            language: document.getElementById('language').value
          };

          try {
            const response = await fetch('/admin/add-client', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
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
          container.innerHTML = '⏳ Loading clients...';

          try {
            const response = await fetch('/admin/clients');
            const json = await response.json();
            
            if (json.success && json.clients.length > 0) {
              container.innerHTML = json.clients.map(client => \`
                <div class="client-card">
                  <h3>\${client.business_name}</h3>
                  <p><strong>Client ID:</strong> \${client.client_id}</p>
                  <p><strong>WhatsApp:</strong> \${client.whatsapp_number}</p>
                  <p><strong>Language:</strong> \${client.language === 'bn' ? 'Bengali (বাংলা)' : 'English'}</p>
                  <p><strong>Created:</strong> \${new Date(client.created_at).toLocaleDateString()}</p>
                  <span class="status-badge status-active">✅ Active</span>
                </div>
              \`).join('');
            } else {
              container.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">No clients found. Add your first client above!</p>';
            }
          } catch (error) {
            container.innerHTML = '<div class="error">❌ Error loading clients</div>';
          }
        }

        document.getElementById('sendMessageForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const result = document.getElementById('sendMessageResult');
          result.innerHTML = '⏳ Sending message...';
          
          const data = {
            phoneNumber: document.getElementById('phoneNumber').value,
            message: document.getElementById('message').value
          };

          try {
            const response = await fetch('/admin/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const json = await response.json();
            
            if (json.success) {
              result.innerHTML = '<div class="success">✅ Message sent successfully!</div>';
              e.target.reset();
            } else {
              result.innerHTML = '<div class="error">❌ ' + json.error + '</div>';
            }
          } catch (error) {
            result.innerHTML = '<div class="error">❌ Error: ' + error.message + '</div>';
          }
        });

        document.getElementById('viewConversationsForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const result = document.getElementById('conversationsResult');
          result.innerHTML = '⏳ Loading conversations...';
          
          const phone = document.getElementById('conversationPhone').value;
          const limit = document.getElementById('conversationLimit').value;

          try {
            const response = await fetch(\`/admin/conversations/\${phone.replace('+', '')}?limit=\${limit}\`);
            const json = await response.json();
            
            if (json.success && json.messages.length > 0) {
              result.innerHTML = \`
                <h3 style="margin-top: 20px;">Conversation with \${json.phoneNumber} (\${json.messageCount} messages)</h3>
                <div style="max-height: 400px; overflow-y: auto; margin-top: 15px; background: white; padding: 15px; border-radius: 8px;">
                  \${json.messages.map(msg => \`
                    <div style="margin: 12px 0; padding: 12px; background: \${msg.sender === 'user' ? '#e3f2fd' : '#f1f8e9'}; border-radius: 8px; border-left: 4px solid \${msg.sender === 'user' ? '#2196F3' : '#8BC34A'};">
                      <strong style="color: #333;">\${msg.sender === 'user' ? '👤 User' : '🤖 Bot'}:</strong>
                      <p style="margin: 8px 0; color: #333;">\${msg.message}</p>
                      <small style="color: #666;">\${new Date(msg.timestamp).toLocaleString()}</small>
                    </div>
                  \`).join('')}
                </div>
              \`;
            } else {
              result.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">No conversations found for this number.</p>';
            }
          } catch (error) {
            result.innerHTML = '<div class="error">❌ Error loading conversations</div>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// ============================================
// SERVER INITIALIZATION
// ============================================

async function startServer() {
  try {
    console.log('\n🚀 Starting WhatsApp AI Chatbot on Render.com...\n');
    
    // Validate AI configuration
    validateAPIConfig();
    
    // Initialize Twilio
    console.log('📱 Initializing Twilio WhatsApp API...');
    initTwilio();
    
    // Initialize Database
    console.log('🗄️  Initializing PostgreSQL database...');
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

    // Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n✅ Server started successfully!\n');
      console.log('═══════════════════════════════════════════');
      console.log(`🌐 Server running on port ${PORT}`);
      console.log(`🤖 AI Provider: ${process.env.AI_PROVIDER || 'openai'}`);
      console.log(`📱 Webhook: /webhook`);
      console.log(`⚙️  Admin Panel: /admin`);
      console.log('═══════════════════════════════════════════');
      console.log('\n💚 Ready to receive WhatsApp messages!\n');
      console.log('🚀 Deployed on Render.com\n');
    });

  } catch (error) {
    console.error('\n❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();
