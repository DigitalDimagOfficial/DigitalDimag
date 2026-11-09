
import express from "express";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const app = express();

app.use(express.json({ limit: "1mb" }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

app.post("/api/chat", async (req, res) => {
  const startTime = Date.now();

  try {
    console.log("Received AI request");

    const message = String(req.body.message || "").slice(0, 4000);

    if (!message.trim()) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    // Get previous conversation from browser
    const history = Array.isArray(req.body.history)
      ? req.body.history.slice(-20)
      : [];

    // Convert previous messages into Gemini format
    const contents = [];

    for (const item of history) {
      if (
        (item.role === "user" || item.role === "model") &&
        typeof item.text === "string" &&
        item.text.trim()
      ) {
        contents.push({
          role: item.role,
          parts: [{ text: item.text.slice(0, 4000) }]
        });
      }
    }

    // Add the latest user message
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    console.log("Sending conversation to Gemini...");
    console.log("Previous messages:", history.length);

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: contents,
      config: {
        maxOutputTokens: 512
      }
    });

    const reply = result.text || "No response received.";

    console.log(
      "Gemini response time:",
      ((Date.now() - startTime) / 1000).toFixed(2),
      "seconds"
    );

    res.json({ reply });

  } catch (error) {
    console.error("AI error:", error?.stack || error);

    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || "AI request failed."
      });
    }
  }
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Digital AI server running on port 3000");
});
