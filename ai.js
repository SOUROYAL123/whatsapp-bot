/**
 * AI MODULE - Enhanced Version with OpenAI/Claude Support
 * Handles AI responses with automatic fallback and multilingual support
 */

const axios = require('axios');

// Configuration
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'; // 'openai' or 'anthropic'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

// System prompts for different languages
const SYSTEM_PROMPTS = {
  en: `You are a helpful and friendly WhatsApp assistant for {BUSINESS_NAME}. 

Your responsibilities:
- Answer customer questions about products, services, and business information
- Help with orders, bookings, and reservations
- Provide accurate information in a conversational, friendly tone
- Keep responses concise (2-4 sentences) since this is WhatsApp
- If you don't know something, politely say so and offer to connect them with a human

Be professional, warm, and helpful!`,

  bn: `আপনি {BUSINESS_NAME} এর একজন সহায়ক এবং বন্ধুত্বপূর্ণ WhatsApp সহায়ক।

আপনার দায়িত্ব:
- পণ্য, সেবা এবং ব্যবসা সম্পর্কে গ্রাহকদের প্রশ্নের উত্তর দিন
- অর্ডার, বুকিং এবং সংরক্ষণে সাহায্য করুন
- কথোপকথন এবং বন্ধুত্বপূর্ণ সুরে সঠিক তথ্য প্রদান করুন
- যেহেতু এটি WhatsApp, উত্তর সংক্ষিপ্ত রাখুন (২-৪ বাক্য)
- যদি আপনি কিছু না জানেন, ভদ্রভাবে বলুন এবং তাদের একজন মানুষের সাথে সংযুক্ত করার প্রস্তাব দিন

পেশাদার, উষ্ণ এবং সহায়ক হন!`
};

/**
 * Detect language from message text
 * Returns 'bn' for Bengali, 'en' for English
 */
function detectLanguage(message) {
  // Bengali Unicode range check
  const bengaliRegex = /[\u0980-\u09FF]/;
  return bengaliRegex.test(message) ? 'bn' : 'en';
}

/**
 * Main function: Get AI response from configured provider
 * Automatically falls back to alternative provider if primary fails
 */
async function getAIResponse(userMessage, conversationHistory = [], clientConfig = {}) {
  try {
    // Detect message language
    const language = detectLanguage(userMessage);
    
    // Build system prompt
    const businessName = clientConfig.business_name || process.env.BUSINESS_NAME || 'our business';
    let systemPrompt = clientConfig.ai_instructions || SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.en;
    systemPrompt = systemPrompt.replace('{BUSINESS_NAME}', businessName);

    // Build conversation messages
    const messages = buildMessageHistory(conversationHistory, userMessage);

    // Try primary AI provider
    console.log(`🤖 Using AI Provider: ${AI_PROVIDER.toUpperCase()}`);
    
    let result;
    if (AI_PROVIDER === 'openai') {
      result = await getOpenAIResponse(systemPrompt, messages, language);
    } else if (AI_PROVIDER === 'anthropic' || AI_PROVIDER === 'claude') {
      result = await getClaudeResponse(systemPrompt, messages, language);
    } else {
      // Default to OpenAI if provider not recognized
      console.warn(`⚠️  Unknown AI provider: ${AI_PROVIDER}, falling back to OpenAI`);
      result = await getOpenAIResponse(systemPrompt, messages, language);
    }

    return result;

  } catch (error) {
    console.error('❌ Primary AI API Error:', error.message);
    
    // Try fallback provider
    try {
      console.log('🔄 Attempting fallback AI provider...');
      const language = detectLanguage(userMessage);
      const businessName = clientConfig.business_name || process.env.BUSINESS_NAME || 'our business';
      let systemPrompt = clientConfig.ai_instructions || SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.en;
      systemPrompt = systemPrompt.replace('{BUSINESS_NAME}', businessName);
      const messages = buildMessageHistory(conversationHistory, userMessage);

      // Try alternative provider
      if (AI_PROVIDER === 'openai' && process.env.ANTHROPIC_API_KEY) {
        return await getClaudeResponse(systemPrompt, messages, language);
      } else if (AI_PROVIDER === 'anthropic' && process.env.OPENAI_API_KEY) {
        return await getOpenAIResponse(systemPrompt, messages, language);
      }
    } catch (fallbackError) {
      console.error('❌ Fallback AI also failed:', fallbackError.message);
    }

    // Return fallback message
    const language = detectLanguage(userMessage);
    return {
      success: false,
      response: getFallbackMessage(language),
      language: language,
      error: error.message
    };
  }
}

/**
 * Build message history in format suitable for AI APIs
 */
function buildMessageHistory(conversationHistory, currentMessage) {
  const messages = [];
  
  // Add conversation history
  conversationHistory.forEach(msg => {
    messages.push({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.message
    });
  });

  // Add current user message
  messages.push({
    role: 'user',
    content: currentMessage
  });

  return messages;
}

/**
 * Get response from OpenAI GPT-3.5-Turbo or GPT-4
 */
async function getOpenAIResponse(systemPrompt, messages, language) {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured in environment variables');
  }

  console.log(`🤖 Calling OpenAI API (${OPENAI_MODEL})...`);

  // OpenAI format: system message as separate object
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: OPENAI_MODEL,
      messages: openaiMessages,
      max_tokens: 500,
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0.3,
      presence_penalty: 0.3
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 30000 // 30 second timeout
    }
  );

  const aiResponse = response.data.choices[0].message.content.trim();
  
  console.log(`✅ OpenAI response: "${aiResponse.substring(0, 50)}..."`);
  console.log(`📊 Tokens used: ${response.data.usage.total_tokens} (prompt: ${response.data.usage.prompt_tokens}, completion: ${response.data.usage.completion_tokens})`);

  return {
    success: true,
    response: aiResponse,
    language: language,
    provider: 'openai',
    model: OPENAI_MODEL,
    tokensUsed: {
      input: response.data.usage.prompt_tokens,
      output: response.data.usage.completion_tokens,
      total: response.data.usage.total_tokens
    }
  };
}

/**
 * Get response from Anthropic Claude
 */
async function getClaudeResponse(systemPrompt, messages, language) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured in environment variables');
  }

  console.log(`🤖 Calling Claude API (${CLAUDE_MODEL})...`);

  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system: systemPrompt,
      messages: messages
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 30000 // 30 second timeout
    }
  );

  const aiResponse = response.data.content[0].text.trim();
  
  console.log(`✅ Claude response: "${aiResponse.substring(0, 50)}..."`);
  console.log(`📊 Tokens used: ${response.data.usage.input_tokens + response.data.usage.output_tokens} (input: ${response.data.usage.input_tokens}, output: ${response.data.usage.output_tokens})`);

  return {
    success: true,
    response: aiResponse,
    language: language,
    provider: 'anthropic',
    model: CLAUDE_MODEL,
    tokensUsed: {
      input: response.data.usage.input_tokens,
      output: response.data.usage.output_tokens,
      total: response.data.usage.input_tokens + response.data.usage.output_tokens
    }
  };
}

/**
 * Get fallback message when AI fails
 */
function getFallbackMessage(language = 'en') {
  const messages = {
    en: "I apologize, but I'm having trouble processing your message right now. Please try again in a moment, or contact us directly for immediate assistance.",
    bn: "দুঃখিত, আমি এই মুহূর্তে আপনার বার্তা প্রক্রিয়া করতে সমস্যা হচ্ছে। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন, অথবা তাৎক্ষণিক সহায়তার জন্য আমাদের সরাসরি যোগাযোগ করুন।"
  };
  
  return messages[language] || messages.en;
}

/**
 * Generate welcome message
 */
function getWelcomeMessage(language = 'en', businessName = 'our business') {
  const welcomeMessages = {
    en: `Hello! 👋 Welcome to ${businessName}. How can I help you today?`,
    bn: `নমস্কার! 👋 ${businessName} এ আপনাকে স্বাগতম। আমি আজ কীভাবে আপনাকে সাহায্য করতে পারি?`
  };
  
  return welcomeMessages[language] || welcomeMessages.en;
}

/**
 * Generate goodbye message
 */
function getGoodbyeMessage(language = 'en', businessName = 'our business') {
  const goodbyeMessages = {
    en: `Thank you for contacting ${businessName}! Feel free to message us anytime. Have a great day! 😊`,
    bn: `${businessName} এর সাথে যোগাযোগ করার জন্য ধন্যবাদ! যেকোনো সময় আমাদের বার্তা পাঠাতে পারেন। শুভ দিন! 😊`
  };
  
  return goodbyeMessages[language] || goodbyeMessages.en;
}

/**
 * Check if message is a greeting
 */
function isGreeting(message) {
  const greetings = [
    'hi', 'hello', 'hey', 'hola', 'namaste', 'good morning', 'good afternoon', 'good evening',
    'হাই', 'হ্যালো', 'নমস্কার', 'প্রণাম', 'শুভ সকাল', 'শুভ বিকাল', 'শুভ সন্ধ্যা'
  ];
  
  const lowerMessage = message.toLowerCase().trim();
  return greetings.some(greeting => 
    lowerMessage === greeting || 
    lowerMessage.startsWith(greeting + ' ') ||
    lowerMessage.startsWith(greeting + '!')
  );
}

/**
 * Check if message is a goodbye
 */
function isGoodbye(message) {
  const goodbyes = [
    'bye', 'goodbye', 'see you', 'thanks', 'thank you', 'धन्यवाद',
    'বাই', 'বিদায়', 'ধন্যবাদ', 'থ্যাংক ইউ', 'দেখা হবে'
  ];
  
  const lowerMessage = message.toLowerCase().trim();
  return goodbyes.some(goodbye => lowerMessage.includes(goodbye));
}

/**
 * Validate API configuration
 */
function validateAPIConfig() {
  const config = {
    provider: AI_PROVIDER,
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    claudeConfigured: !!process.env.ANTHROPIC_API_KEY
  };

  console.log('🔧 AI Configuration:');
  console.log(`   Provider: ${config.provider.toUpperCase()}`);
  console.log(`   OpenAI Key: ${config.openaiConfigured ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Claude Key: ${config.claudeConfigured ? '✅ Configured' : '❌ Missing'}`);

  // Warn if primary provider not configured
  if (AI_PROVIDER === 'openai' && !config.openaiConfigured) {
    console.warn('⚠️  WARNING: OpenAI selected but API key not configured!');
  }
  if ((AI_PROVIDER === 'anthropic' || AI_PROVIDER === 'claude') && !config.claudeConfigured) {
    console.warn('⚠️  WARNING: Claude selected but API key not configured!');
  }

  return config;
}

/**
 * Get AI provider information
 */
function getProviderInfo() {
  return {
    current: AI_PROVIDER,
    model: AI_PROVIDER === 'openai' ? OPENAI_MODEL : CLAUDE_MODEL,
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasClaude: !!process.env.ANTHROPIC_API_KEY
  };
}

// Validate configuration on module load
validateAPIConfig();

module.exports = {
  getAIResponse,
  detectLanguage,
  getWelcomeMessage,
  getGoodbyeMessage,
  getFallbackMessage,
  isGreeting,
  isGoodbye,
  validateAPIConfig,
  getProviderInfo,
  SYSTEM_PROMPTS
};
