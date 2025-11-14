/**
 * WHATSAPP MODULE - Twilio Integration
 */
// whatsapp.js

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"

if (!accountSid || !authToken || !fromNumber) {
  console.error('❌ Twilio env vars missing. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM');
}

const client = twilio(accountSid, authToken);

/**
 * Send a WhatsApp message via Twilio
 */
async function sendWhatsAppMessage(to, body) {
  if (!to.startsWith('whatsapp:')) {
    to = `whatsapp:${to}`;
  }

  const from = fromNumber;

  const msg = await client.messages.create({
    from,
    to,
    body
  });

  console.log(`📤 WhatsApp sent to ${to}: "${body.substring(0, 60)}..."`);
  return msg;
}

/**
 * Parse incoming Twilio webhook body
 * Twilio sends POST with form fields
 */
function parseIncoming(body) {
  return {
    from: body.From, // e.g. "whatsapp:+91..."
    to: body.To,     // your Twilio "whatsapp:+1415..."
    body: body.Body || ''
  };
}

module.exports = {
  sendWhatsAppMessage,
  parseIncoming
};

}

module.exports = {
  handleWhatsAppWebhook
};
