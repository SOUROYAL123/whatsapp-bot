/**
 * WHATSAPP MODULE
 * Twilio WhatsApp API integration optimized for Render
 */

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

let twilioClient = null;

/**
 * Initialize Twilio client
 */
function initTwilio() {
  if (!accountSid || !authToken) {
    console.warn('⚠️  Twilio credentials not configured');
    return null;
  }

  if (!twilioWhatsAppNumber) {
    console.warn('⚠️  TWILIO_WHATSAPP_NUMBER not configured');
    return null;
  }
  
  try {
    twilioClient = twilio(accountSid, authToken);
    console.log('✅ Twilio WhatsApp initialized');
    console.log(`📱 WhatsApp number: ${twilioWhatsAppNumber}`);
    return twilioClient;
  } catch (error) {
    console.error('❌ Failed to initialize Twilio:', error.message);
    return null;
  }
}

/**
 * Send WhatsApp message
 */
async function sendWhatsAppMessage(to, message) {
  try {
    if (!twilioClient) {
      throw new Error('Twilio client not initialized');
    }

    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    
    const result = await twilioClient.messages.create({
      body: message,
      from: twilioWhatsAppNumber,
      to: toNumber
    });

    console.log(`✅ WhatsApp message sent to ${toNumber}`);
    
    return { 
      success: true, 
      sid: result.sid,
      to: toNumber,
      status: result.status
    };

  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error.message);
    
    if (error.code === 21608) {
      console.error('   → Recipient has not joined Twilio Sandbox');
    } else if (error.code === 21211) {
      console.error('   → Invalid phone number format');
    }
    
    return { 
      success: false, 
      error: error.message,
      code: error.code 
    };
  }
}

/**
 * Parse incoming WhatsApp webhook data
 */
function parseIncomingMessage(req) {
  try {
    const message = {
      from: req.body.From,
      to: req.body.To,
      body: req.body.Body || '',
      messageId: req.body.MessageSid,
      profileName: req.body.ProfileName || 'Unknown',
      numMedia: parseInt(req.body.NumMedia) || 0,
      mediaUrls: []
    };

    if (message.numMedia > 0) {
      for (let i = 0; i < message.numMedia; i++) {
        message.mediaUrls.push({
          url: req.body[`MediaUrl${i}`],
          type: req.body[`MediaContentType${i}`]
        });
      }
    }

    message.phoneNumber = message.from.replace('whatsapp:', '');

    return message;
  } catch (error) {
    console.error('❌ Error parsing incoming message:', error);
    return null;
  }
}

/**
 * Rate limiting
 */
const messageTimestamps = new Map();

function checkRateLimit(phoneNumber, limit = 50, windowMs = 3600000) {
  const now = Date.now();
  const userMessages = messageTimestamps.get(phoneNumber) || [];
  
  const recentMessages = userMessages.filter(timestamp => now - timestamp < windowMs);
  
  if (recentMessages.length >= limit) {
    console.warn(`⚠️  Rate limit exceeded for ${phoneNumber}`);
    return false;
  }
  
  recentMessages.push(now);
  messageTimestamps.set(phoneNumber, recentMessages);
  
  return true;
}

function getRateLimitStatus(phoneNumber, windowMs = 3600000) {
  const now = Date.now();
  const userMessages = messageTimestamps.get(phoneNumber) || [];
  const recentMessages = userMessages.filter(timestamp => now - timestamp < windowMs);
  
  return {
    count: recentMessages.length,
    limit: parseInt(process.env.RATE_LIMIT) || 50,
    remaining: (parseInt(process.env.RATE_LIMIT) || 50) - recentMessages.length
  };
}

function cleanupRateLimitData() {
  const now = Date.now();
  const windowMs = 3600000;
  let cleaned = 0;
  
  for (const [phoneNumber, timestamps] of messageTimestamps.entries()) {
    const recentMessages = timestamps.filter(timestamp => now - timestamp < windowMs);
    
    if (recentMessages.length === 0) {
      messageTimestamps.delete(phoneNumber);
      cleaned++;
    } else {
      messageTimestamps.set(phoneNumber, recentMessages);
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up rate limit data for ${cleaned} users`);
  }
}

setInterval(cleanupRateLimitData, 600000);

module.exports = {
  initTwilio,
  sendWhatsAppMessage,
  parseIncomingMessage,
  checkRateLimit,
  getRateLimitStatus
};
