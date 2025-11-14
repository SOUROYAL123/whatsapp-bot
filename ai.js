/**
 * AI MODULE - Google Gemini (Updated to v1 API + gemini-1.5-flash)
 */

const axios = require("axios");

const GEMINI_MODEL = "gemini-1.5-flash";   // Latest, fast, stable
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

// Detect language automatically
function detectLanguage(message) {
  const bengaliRegex = /[\u0980-\u09FF]/;
  return bengaliRegex.test(message) ? "bn" : "en";
}

// System prompts
const SYSTEM_PROMPTS = {
  en: `You are a helpful WhatsApp assistant for {BUSINESS_NAME}. Answer questions about products and services. Keep responses short (2–3 sentences) since this is WhatsApp. Be friendly and professional.`,
  bn: `আপনি {BUSINESS_NAME} এর WhatsApp সহায়ক। পণ্য বা সেবা সম্পর্কে সংক্ষিপ্ত (২–৩ বাক্য) উত্তর দিন। বন্ধুত্বপূর্ণ এবং পেশাদার হোন।`
};

/**
 * Get AI Response from Google Gemini
 */
async function getAIResponse(userMessage, conversationHistory = [], clientConfig = {}) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    const language = detectLanguage(userMessage);
    const businessName =
      clientConfig.business_name ||
      process.env.BUSINESS_NAME ||
      "our business";

    let systemPrompt =
      clientConfig.ai_instructions ||
      SYSTEM_PROMPTS[language] ||
      SYSTEM_PROMPTS.en;

    systemPrompt = systemPrompt.replace("{BUSINESS_NAME}", businessName);

    console.log("🤖 Calling Google Gemini API...");

    // Build message payload for Gemini (new v1 API format)
    const contents = [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\nNow respond to the user message: ${userMessage}`
          }
        ]
      }
    ];

    // Add conversation memory
    conversationHistory.forEach(msg => {
      contents.push({
        role: msg.sender === "user" ? "user" : "model",
        parts: [{ text: msg.message }]
      });
    });

    // Add latest user message
    contents.push({
      role: "user",
      parts: [{ text: userMessage }]
    });

    // Gemini API request — final corrected version
    const response = await axios.post(
      `${GEMINI_ENDPOINT}?key=${apiKey}`,
      {
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 300
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
        ]
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 30000
      }
    );

    const aiResponse =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      "I'm sorry, I couldn't generate a response.";

    console.log(`✅ Gemini reply: "${aiResponse.substring(0, 60)}..."`);

    return {
      success: true,
      response: aiResponse,
      language: language,
      provider: "gemini"
    };

  } catch (error) {
    console.error("❌ Gemini API Error:", error.response?.data || error.message);

    const language = detectLanguage(userMessage);

    const fallbackMessage =
      language === "bn"
        ? "দুঃখিত, আমি এখন আপনার বার্তা প্রক্রিয়া করতে পারছি না। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
        : "Sorry, I'm having trouble right now. Please try again in a moment.";

    return {
      success: false,
      response: fallbackMessage,
      language: language,
      error: error.message
    };
  }
}

/**
 * Validate Gemini API Configuration
 */
function validateAPIConfig() {
  const configured = !!process.env.GEMINI_API_KEY;
  console.log("🔧 AI Configuration:");
  console.log(`   Provider: GEMINI`);
  console.log(`   Gemini Key: ${configured ? "✅ Configured" : "❌ Missing"}`);

  if (!configured) {
    console.error("❌ GEMINI_API_KEY not found in environment variables!");
  }

  return configured;
}

module.exports = {
  getAIResponse,
  detectLanguage,
  validateAPIConfig
};
