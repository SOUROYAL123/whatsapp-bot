/**
 * WHATSAPP MODULE - Twilio Integration
 */

const twilio = require('twilio');

let twilioClient = null;

// Rate limiting
const messageCount = new Map();
const RATE_LIMIT_WINDOW = 3600000; // 1 hour

function initTwilio() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error('❌ Twilio credentials missing!');
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN required');
  }

  twilioClient = twilio(accountSid, authToken);
  console.log('✅ Twilio WhatsApp initialized');
  console.log(`📱 WhatsApp number: ${process.env.TWILIO_WHATSAPP_NUMBER}`);
}

async function sendWhatsAppMessage(to, message) {
  try {
    if (!twilioClient) {
      throw new Error('Twilio not initialized');
    }

    const result = await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: to,
      body: message
    });

    return {
      success: true,
      sid: result.sid
    };

  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

function parseIncomingMessage(req) {
  try {
    const from = req.body.From;
    const body = req.body.Body || '';
    const profileName = req.body.ProfileName || 'User';
    const numMedia = parseInt(req.body.NumMedia) || 0;

    const phoneNumber = from.replace('whatsapp:', '');

    return {
      from,
      phoneNumber,
      body,
      profileName,
      numMedia
    };
  } catch (error) {
    console.error('Error parsing message:', error);
    return null;
  }
}

function checkRateLimit(phoneNumber, limit = 50) {
  const now = Date.now();
  const userMessages = messageCount.get(phoneNumber) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };

  if (now > userMessages.resetTime) {
    messageCount.set(phoneNumber, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userMessages.count >= limit) {
    return false;
  }

  userMessages.count++;
  messageCount.set(phoneNumber, userMessages);
  return true;
}

function getRateLimitStatus(phoneNumber) {
  const userMessages = messageCount.get(phoneNumber);
  if (!userMessages) {
    return { count: 0, limit: parseInt(process.env.RATE_LIMIT) || 50 };
  }
  return { count: userMessages.count, limit: parseInt(process.env.RATE_LIMIT) || 50 };
}

module.exports = {
  initTwilio,
  sendWhatsAppMessage,
  parseIncomingMessage,
  checkRateLimit,
  getRateLimitStatus
};
