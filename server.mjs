import express from 'express';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

app.use(express.json({ limit: '22mb' }));
app.use(express.static(process.cwd(), { extensions: ['html'] }));

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

app.get('/api/status', (_req, res) => {
  res.json({ ok: true, configured: Boolean(ai), model: MODEL });
});

app.post('/api/chat', async (req, res) => {
  const started = Date.now();
  try {
    if (!ai) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured in Codespaces Secrets.' });

    const message = String(req.body?.message || '').trim().slice(0, 12000);
    if (!message) return res.status(400).json({ error: 'Please enter a message.' });

    const memory = String(req.body?.memory || '').slice(0, 5000);
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-16) : [];
    const attachment = req.body?.attachment;

    const contents = [];
    for (const item of history) {
      if (!item || !['user', 'model'].includes(item.role) || typeof item.text !== 'string') continue;
      contents.push({ role: item.role, parts: [{ text: item.text.slice(0, 5000) }] });
    }

    const parts = [];
    if (memory) parts.push({ text: `User-approved memory/context (use only when relevant):\n${memory}` });
    parts.push({ text: message });

    if (attachment && typeof attachment.data === 'string' && typeof attachment.mimeType === 'string') {
      const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
      if (!allowed.includes(attachment.mimeType)) {
        return res.status(400).json({ error: 'Supported attachments: PNG, JPG, WEBP and PDF.' });
      }
      if (attachment.data.length > 18_000_000) {
        return res.status(413).json({ error: 'Attachment is too large. Please use a file under about 13 MB.' });
      }
      parts.push({ inlineData: { mimeType: attachment.mimeType, data: attachment.data } });
    }

    contents.push({ role: 'user', parts });

    const config = { maxOutputTokens: 1200 };
    if (req.body?.webSearch === true) config.tools = [{ googleSearch: {} }];

    const result = await ai.models.generateContent({ model: MODEL, contents, config });
    const reply = result.text || 'No text response received.';
    const candidate = result.candidates?.[0];
    const grounding = candidate?.groundingMetadata;
    const sources = (grounding?.groundingChunks || [])
      .map(chunk => chunk.web)
      .filter(item => item?.uri)
      .slice(0, 8)
      .map(item => ({ title: item.title || item.uri, url: item.uri }));

    console.log(`Gemini response: ${((Date.now() - started) / 1000).toFixed(1)}s`);
    res.json({ reply, sources });
  } catch (error) {
    console.error('AI error:', error?.stack || error);
    const message = error?.message || 'AI request failed.';
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Digital Dimag server running on port ${PORT}`);
  console.log(`Gemini model: ${MODEL}`);
});
