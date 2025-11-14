// webhook.js

const db = require('./database');
const { getAIResponse } = require('./ai');
const { sendWhatsAppMessage, parseIncoming } = require('./whatsapp');

/**
 * Handle Twilio WhatsApp webhook
 */
async function handleWhatsAppWebhook(req, res) {
  try {
    const incoming = parseIncoming(req.body);
    const from = incoming.from; // user
    const to   = incoming.to;   // your Twilio number
    const text = incoming.body;

    console.log('📩 NEW MESSAGE');
    console.log(`   From: ${from}`);
    console.log(`   Text: "${text}"`);

    // 1) find client
    let client = await db.getClientByTwilioNumber(to);
    if (!client) {
      client = await db.getDefaultClient();
    }

    if (!client) {
      console.error('❌ No client configured in database');
      return res.status(500).end();
    }

    // 2) log inbound message
    await db.logMessage({
      client_id: client.id,
      from_number: from,
      direction: 'inbound',
      body: text
    });

    // 3) check business hours
    const now = new Date();
    const hourStr = now.toLocaleString('en-GB', {
      hour12: false,
      hour: '2-digit',
      timeZone: client.timezone || 'Asia/Kolkata'
    });
    const hour = Number(hourStr);

    if (hour < client.open_hour || hour >= client.close_hour) {
      const closedMsg =
        `We are currently closed. Our hours are ` +
        `${client.open_hour}:00–${client.close_hour}:00. ` +
        `Please leave a message and we will reply after we open.`;

      await sendWhatsAppMessage(from, closedMsg);

      await db.logMessage({
        client_id: client.id,
        from_number: from,
        direction: 'outbound',
        body: closedMsg
      });

      return res.status(200).end();
    }

    // 4) normal AI reply
    console.log('🤖 Generating response...');
    const aiResult = await getAIResponse(text, [], {
      business_name: client.business_name,
      ai_instructions: client.ai_instructions
    });

    await sendWhatsAppMessage(from, aiResult.response);

    await db.logMessage({
      client_id: client.id,
      from_number: from,
      direction: 'outbound',
      body: aiResult.response
    });

    return res.status(200).end();

  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.status(500).end();
  }
}

module.exports = {
  handleWhatsAppWebhook
};
