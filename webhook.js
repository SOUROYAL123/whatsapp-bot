// webhook.js

const db = require("./database");
const { getAIResponse } = require("./ai");
const { sendWhatsAppMessage, parseIncoming } = require("./whatsapp");

async function handleWhatsAppWebhook(req, res) {
  try {
    const incoming = parseIncoming(req.body);
    const from = incoming.from;
    const to = incoming.to;
    const text = incoming.body;

    console.log("📩 NEW MESSAGE");
    console.log(`   From: ${from}`);
    console.log(`   To:   ${to}`);
    console.log(`   Text: "${text}"`);

    // 1) Get client by WhatsApp number
    let client = await db.getClientByTwilioNumber(to);

    if (!client) {
      client = await db.getDefaultClient();
    }

    if (!client) {
      console.error("❌ No client found in DB");
      return res.status(500).end();
    }

    // 2) Log inbound message
    await db.logMessage({
      client_id: client.id,
      from_number: from,
      direction: "inbound",
      body: text
    });

    // 3) Check business hours
    const now = new Date();
    const hourStr = now.toLocaleString("en-GB", {
      hour12: false,
      hour: "2-digit",
      timeZone: client.timezone || "Asia/Kolkata"
    });

    const hour = Number(hourStr);

    if (hour < client.open_hour || hour >= client.close_hour) {
      const msg = `We are currently closed.\nHours: ${client.open_hour}:00–${client.close_hour}:00`;
      await sendWhatsAppMessage(from, msg);

      await db.logMessage({
        client_id: client.id,
        from_number: from,
        direction: "outbound",
        body: msg
      });

      return res.status(200).end();
    }

    // 4) AI
    console.log("🤖 Generating AI reply...");
    const ai = await getAIResponse(text, [], {
      business_name: client.business_name,
      ai_instructions: client.ai_instructions
    });

    const reply = ai.response || "Sorry, please try again.";

    await sendWhatsAppMessage(from, reply);

    await db.logMessage({
      client_id: client.id,
      from_number: from,
      direction: "outbound",
      body: reply
    });

    res.status(200).end();

  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).end();
  }
}

module.exports = {
  handleWhatsAppWebhook
};
