/**
 * AI MODULE - Google Gemini (v1 API + gemini-2.0-flash-lite)
 * Enhanced with strong WhatsApp-friendly prompts
 */

const axios = require("axios");

// FINAL WORKING MODEL for your key
const GEMINI_MODEL = "gemini-2.0-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

// Detect English vs Bengali
function detectLanguage(message) {
  const bengaliRegex = /[\u0980-\u09FF]/;
  return bengaliRegex.test(message) ? "bn" : "en";
}

// STRONGER BUSINESS-GRADE PROMPTS
const SYSTEM_PROMPTS = {
  en: `
You are a friendly, helpful WhatsApp AI assistant for {BUSINESS_NAME}.  
Your job:
- Always give a meaningful, polite response even if the user sends random text, numbers, emojis, or unclear messages.
- If the message is unclear, ask a simple clarification question.
- Keep all replies short: **1–2 sentences only**.
- Maintain a professional but warm tone.
- Never say "I cannot process this". Instead, guide the user or ask what they need.
`,

  bn: `
আপনি {BUSINESS_NAME} এর একজন বন্ধুসুলভ WhatsApp সহায়ক।  
আপনার কাজ:
- ব্যবহারকারী অস্পষ্ট, এলোমেলো লেখা, সংখ্যা, বা ইমোজি পাঠালেও সর্বদা ভদ্র ও অর্থবহ উত্তর দিন।
- বার্তাটি অস্পষ্ট হলে সহজভাবে জানতে চান তারা ঠিক কী জানতে চান।
- উত্তর **১–২ বাক্যের মধ্যে সংক্ষিপ্ত** রাখুন।
- ভদ্র, বন্ধুসুলভ ও পেশাদার ভঙ্গি বজায় রাখুন।
- কখনো "আমি এটি প্রসেস করতে পারছি না" বলবেন না। বরং সাহায্য করার চেষ্টা করুন।
`
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
    const businessName = clientConfig.business_name || process.env.BUSINESS_NAME || "our business";

    // Build final instruction
    let systemPrompt = clientConfig.ai_instructions || SYSTEM_PROMPTS[language] || SYSTEM_PROMPTS.en;
    systemPrompt = systemPrompt.replace("{BUSINESS_NAME}", businessName);

    console.log("🤖 Calling Google Gemini API...");

    // Build request contents
    const contents = [
      {
        role: "user",
        parts: [{ text: `${systemPrompt}\n\nUser message: ${userMessage}` }]
      }
    ];

    // Add past conversation
    conversationHistory.forEach(msg => {
      contents.push({
        role: msg.sender === "user" ? "user" : "model",
        parts: [{ text: msg.message }]
      });
    });

    // Add current user message again (improves clarity)
    contents.push({
      role: "user",
      parts: [{ text: userMessage }]
    });

    // API call
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
      "I'm here to help—could you clarify your question a bit?";

    console.log(`✅ Gemini reply: "${aiResponse.substring(0, 60)}..."`);

    return {
      success: true,
      response: aiResponse,
      language,
      provider: "gemini"
    };

  } catch (error) {
    console.error("❌ Gemini API Error:", error.response?.data || error.message);

    const language = detectLanguage(userMessage);

    const fallbackMessage =
      language === "bn"
        ? "দুঃখিত, একটু সমস্যা হচ্ছে। দয়া করে আবার লিখে জানান কী সাহায্য লাগবে।"
        : "Sorry, something went wrong. Could you please type your message again?";

    return {
      success: false,
      response: fallbackMessage,
      language,
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
  console.log(`   Key: ${configured ? "✅ Configured" : "❌ Missing"}`);

  return configured;
}

module.exports = {
  getAIResponse,
  detectLanguage,
  validateAPIConfig
};
