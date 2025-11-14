// server.js

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cron = require("node-cron");

const db = require("./database");
const { handleWhatsAppWebhook } = require("./webhook");
const { sendWhatsAppMessage } = require("./whatsapp");

const app = express();
const PORT = process.env.PORT || 3000;

// Parse Twilio webhook
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Home page
app.get("/", (req, res) => {
  res.send("WhatsApp AI Bot is running");
});

// Webhook route
app.post("/webhook", handleWhatsAppWebhook);

// Admin: list clients
app.get("/api/clients", async (req, res) => {
  res.json(await db.getClients());
});

// Admin: update schedule
app.put("/api/clients/:id/schedule", express.json(), async (req, res) => {
  const id = Number(req.params.id);
  const updated = await db.updateClientSchedule(id, req.body);
  if (!updated) return res.status(404).json({ error: "Client not found" });
  res.json(updated);
});

// Start server
(async () => {
  await db.initDatabase();

  app.listen(PORT, () => {
    console.log("═══════════════════════════════════════");
    console.log(`🌐 Port: ${PORT}`);
    console.log("📱 Webhook: POST /webhook");
    console.log("⚙️  Admin API: /api/clients");
    console.log("═══════════════════════════════════════");
    console.log("💚 READY FOR WHATSAPP MESSAGES");
  });
})();
