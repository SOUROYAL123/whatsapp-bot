/**
 * AI MODULE – GROQ FIRST (Gemini only if enabled)
 */

require('dotenv').config();
const axios = require('axios');

// read env
const PROVIDER = (process.env.AI_PROVIDER || "groq").toLowerCase();

// GROQ
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-70b-versatile";

// Gemini (optional fallback – disabled unless key provided)
const GEMINI_KEY = process.env.GEMINI_API_KEY;

// OpenAI (optional fallback)
const OPENAI_KEY = process.env.OPENAI_API_KEY;

/**
 * MAIN FUNCTION: Returns AI Response
 */
async function getAIResponse(userText, history = [], ctx = {}) {
  console.log("🤖 Provider:", PROVIDER);

  // ALWAYS TRY GROQ FIRST (your choice)
  if (GROQ_KEY) {
    try {
      return await callGroq(userText, history, ctx);
    } catch (e) {
      console.error("❌ GROQ ERROR:", e?.response?.data || e);
    }
  }

  // FALLBACK #2 — OPENAI (if key exists)
  if (OPENAI_KEY) {
    try {
      return await callOpenAI(userText, history, ctx);
    } catch (e) {
      console.error("❌ OPENAI Error:", e?.response?.data || e);
    }
  }

  // FALLBACK #3 — GEMINI (only if key exists)
  if (GEMINI_KEY) {
    try {
      return await callGemini(userText, history, ctx);
    } catch (e) {
      console.error("❌ Gemini Error:", e?.response?.data || e);
    }
  }

  // FINAL FALLBACK — offline text
  console.log("⚠️ All AI services failed. Returning default error.");
  return { response: "Sorry, my AI engine is busy. Please try again later." };
}

/* ------------------------------
   GROQ (PRIMARY ENGINE)
------------------------------- */
async function callGroq(userText, history, ctx) {
  console.log("🤖 Calling GROQ...");

  const prompt =
    `${ctx.ai_instructions || ""}\n\nUser: ${userText}\nAI:`;

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: ctx.ai_instructions || "You are a smart assistant." },
        { role: "user", content: userText }
      ]
    },
    {
      headers: {
        "Authorization": `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return { response: res.data.choices[0].message.content };
}

/* ------------------------------
   OPENAI (OPTIONAL FALLBACK)
------------------------------- */
async function callOpenAI(userText, history, ctx) {
  console.log("🤖 Calling OpenAI...");

  const prompt =
    `${ctx.ai_instructions || ""}\n\nUser: ${userText}\nAI:`;

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: ctx.ai_instructions || "You are a smart assistant." },
        { role: "user", content: userText }
      ]
    },
    {
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return { response: res.data.choices[0].message.content };
}

/* ------------------------------
   GEMINI (OPTIONAL FALLBACK)
------------------------------- */
async function callGemini(userText, history, ctx) {
  console.log("🤖 Calling Gemini...");

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    {
      contents: [{
        parts: [{ text: `${ctx.ai_instructions || ""}\n\nUser: ${userText}` }]
      }]
    }
  );

  return { response: res.data.candidates[0].content.parts[0].text };
}

module.exports = {
  getAIResponse
};
