// server.js — minimal proxy for Storyline → OpenAI

// Uses Node 18+ built-in fetch (no extra library needed)
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());

// During testing you can allow all origins.
// Later, replace "*" with your LMS domain, e.g. "https://yourlms.com"
app.use(cors({ origin: "*", methods: ["POST", "GET"] }));

// Health check (lets you test in the browser)
app.get("/", (req, res) => {
  res.send("WFS AI Proxy is running ✅");
});

// Helper to call OpenAI Chat Completions
async function chatCompletion(messages, { maxTokens = 220, temperature = 0.5 } = {}) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",        // lightweight + fast for short replies
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

// Map name → job title (your special cases)
function getJobTitle(rawName) {
  const norm = (rawName || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (norm === "jillian" || norm === "jillian khan") return "Head of Learning and Engagement";
  if (["kirsty", "kirsty beavis", "tomi", "tomi pilvinen"].includes(norm)) {
    return "Learning and Engagement Specialist";
  }
  return null;
}

// 1) Personalised welcome
app.post("/welcome", async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    const jobTitle = getJobTitle(name);
    const prompt = jobTitle
      ? `Welcome ${name || "there"} to WFS. Acknowledge their role: ${jobTitle}. Write a short, warm, professional welcome in 2–3 sentences. Use British English.`
      : `Welcome ${name || "there"} to WFS. Write a short, warm, professional welcome in 2–3 sentences. Use British English.`;

    const messages = [
      { role: "system", content: "You are a friendly onboarding assistant for WFS. Keep replies concise and welcoming." },
      { role: "user", content: prompt }
    ];

    const text = await chatCompletion(messages, { maxTokens: 150, temperature: 0.5 });
    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ text: "Welcome to WFS! (We couldn’t fetch your personalised message just now.)" });
  }
});

// 2) First-day question
app.post("/question", async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    const question = (req.body?.question || "").trim();
    const jobTitle = getJobTitle(name);

    const context = jobTitle
      ? `The learner is ${name} (${jobTitle}).`
      : (name ? `The learner is ${name}.` : "No name provided.");

    const userPrompt = `${context}
They asked about their first day at WFS: "${question}"
Answer in 2–4 short, friendly sentences with practical guidance.
If the question is vague, give key pointers (start time, where to go, ID/badge, PPE or dress code, safety briefing, who to ask for, parking/canteen) and suggest contacting their line manager or the Learning & Engagement team for specifics. Use British English.`;

    const messages = [
      { role: "system", content: "You help new starters with first-day questions at WFS. Be friendly, accurate, and concise. Use British English." },
      { role: "user", content: userPrompt }
    ];

    const text = await chatCompletion(messages, { maxTokens: 220, temperature: 0.5 });
    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ text: "Sorry—couldn’t fetch an answer just now. Please check your joining instructions or contact your line manager." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("WFS AI Proxy listening on port " + PORT));
