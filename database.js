/**
 * AI MODULE - Google Gemini (WORKING VERSION)
 */

const axios = require('axios');

// Detect language
function detectLanguage(message) {
  const bengaliRegex = /[\u0980-\u09FF]/;
  return bengaliRegex.test(message) ? 'bn' : 'en';
}

// System prompts
const SYSTEM_PROMPTS = {
  en: `You are a helpful WhatsApp assistant for {BUSINESS_NAME}. Answer questions about products and services. Keep responses short (2-3 sentences) since this is WhatsApp. Be friendly and professional.`,
  bn: `আপনি {BUSINESS_NAME} এর একজন সহায়ক WhatsApp সহায়ক। পণ্য এবং সেবা সম্পর্কে প্রশ্নের উত্তর দিন। যেহেতু এটি WhatsApp, উত্তর সংক্ষিপ্ত রাখুন (২-৩ বাক্য)। বন্ধুত্বপূর্ণ এবং পেশাদার হন।`
};

/**
 * Get AI Response from Google Gemini
 */
async function getAIResponse(userMessage, conversationHistory = [], clientConfig = {}) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const language = detectLanguage(userMessage);
    const businessName = clientConfig.business_name || process.env.BUSINESS_NAME || 'our business';
    let systemPrompt = clientConfig.ai_instructions || SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.en;
    systemPrompt = systemPrompt.replace('{BUSINESS_NAME}', businessName);

    console.log(`🤖 Calling Google Gemini API...`);

    // Build prompt
    let fullPrompt = `${systemPrompt}\n\n`;
    
    if (conversationHistory.length > 0) {
      fullPrompt += 'Recent conversation:\n';
      conversationHistory.forEach(msg => {
        fullPrompt += `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.message}\n`;
      });
      fullPrompt += '\n';
    }
    
    fullPrompt += `User: ${userMessage}\nAssistant:`;

    // CORRECT API CALL - v1 endpoint with gemini-1.5-flash
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=' + apiKey,
      {
        contents: [{
          parts: [{ text: fullPrompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 500
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const aiResponse = response.data.candidates[0].content.parts[0].text.trim();
    
    console.log(`✅ Gemini response: "${aiResponse.substring(0, 50)}..."`);

    return {
      success: true,
      response: aiResponse,
      language: language,
      provider: 'gemini'
    };

  } catch (error) {
    console.error('❌ Gemini API Error:', error.response?.data || error.message);
    
    const language = detectLanguage(userMessage);
    const fallbackMessage = language === 'bn' 
      ? 'দুঃখিত, আমি এই মুহূর্তে আপনার বার্তা প্রক্রিয়া করতে সমস্যা হচ্ছে। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।'
      : 'Sorry, I\'m having trouble right now. Please try again in a moment.';

    return {
      success: false,
      response: fallbackMessage,
      language: language,
      error: error.message
    };
  }
}

function validateAPIConfig() {
  const configured = !!process.env.GEMINI_API_KEY;
  console.log('🔧 AI Configuration:');
  console.log(`   Provider: GEMINI`);
  console.log(`   Gemini Key: ${configured ? '✅ Configured' : '❌ Missing'}`);
  
  if (!configured) {
    console.error('❌ GEMINI_API_KEY not found in environment variables!');
  }
  
  return configured;
}

module.exports = {
  getAIResponse,
  detectLanguage,
  validateAPIConfig
};
