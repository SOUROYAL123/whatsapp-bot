/**
 * WHATSAPP MODULE - Twilio Integration
 */

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken  = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // "whatsapp:+14155238886"

if (!accountSid || !authToken || !fromNumber) {
  console.error('❌ Twilio env vars missing. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM');
}

const client = twilio(accountSid, authToken);

/**
 * Send a WhatsApp message via Twilio
 */
async function sendWhatsAppMessage(to, body) {
  try {
    if (!to.startsWith('whatsapp:')) {
      to = `whatsapp:${to}`;
    }

    const msg = await client.messages.create({
      from: fromNumber,
      to,
      body
    });

    console.log(`📩 WhatsApp sent to ${to}: "${body.substring(0, 60)}..."`);
    return msg;

  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    throw error;
  }
}

/**
 * Parse incoming Twilio webhook payload
 */
function parseIncoming(body) {
  return {
    from: body.From, // "whatsapp:+91..."
    to: body.To,     // Twilio sandbox: "whatsapp:+1415..."
    body: body.Body || ''
  };
}

module.exports = {
  sendWhatsAppMessage,
  parseIncoming
};
