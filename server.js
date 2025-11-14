// server.js

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');

const db = require('./database');
const { handleWhatsAppWebhook } = require('./webhook');
const { sendWhatsAppMessage } = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio sends form-encoded body
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Simple home page
app.get('/', (req, res) => {
  res.send('WhatsApp AI Bot is running');
});

// Webhook route
app.post('/webhook', handleWhatsAppWebhook);

// Admin API: list clients
app.get('/api/clients', async (req, res) => {
  const clients = await db.getClients();
  res.json(clients);
});

// Admin API: update schedule for one client
app.put('/api/clients/:id/schedule', express.json(), async (req, res) => {
  const id = Number(req.params.id);
  const updated = await db.updateClientSchedule(id, req.body);
  if (!updated) return res.status(404).json({ error: 'Client not found' });
  res.json(updated);
});

// Initialize DB then start server
(async () => {
  await db.initDatabase();

  app.listen(PORT, () => {
    console.log('═══════════════════════════════════════');
    console.log(`🌐 Port: ${PORT}`);
    console.log('📱 Webhook: /webhook');
    console.log('⚙️  Admin: /api/clients');
    console.log('═══════════════════════════════════════');
    console.log('💚 Ready for WhatsApp messages!');
  });
})();

// ─────────────────────────────────────────
// CRON JOB #1 – Daily summary per client
// Runs every 5 minutes and checks times.
// ─────────────────────────────────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    const clients = await db.getClients();
    const now = new Date();

    for (const client of clients) {
      if (!client.daily_summary_time) continue;

      const nowStr = now.toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        timeZone: client.timezone || 'Asia/Kolkata'
      });

      const targetStr = client.daily_summary_time; // "HH:MM"

      if (nowStr === targetStr) {
        const summary = await db.getTodaySummary(client.id);

        const text =
          `Daily summary for ${client.business_name}:\n` +
          `• Total messages: ${summary.total_messages}\n` +
          `• Inbound: ${summary.inbound_count}\n` +
          `• Outbound: ${summary.outbound_count}`;

        if (client.phone) {
          await sendWhatsAppMessage(client.phone, text);
          console.log(`📊 Sent daily summary to ${client.business_name}`);
        }
      }
    }
  } catch (err) {
    console.error('Cron daily summary error:', err);
  }
});

// ─────────────────────────────────────────
// CRON JOB #2 – Broadcast / promotions
// ─────────────────────────────────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    const clients = await db.getClients();
    const now = new Date();

    const nowStr = now.toLocaleTimeString('en-GB', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    for (const client of clients) {
      if (!client.broadcast_message || !client.broadcast_time) continue;

      if (nowStr === client.broadcast_time) {
        const leads = await db.getLeads(client.id);

        for (const lead of leads) {
          await sendWhatsAppMessage(lead.phone, client.broadcast_message);
        }

        console.log(`📣 Broadcast sent for ${client.business_name} to ${leads.length} leads`);
      }
    }
  } catch (err) {
    console.error('Cron broadcast error:', err);
  }
});
