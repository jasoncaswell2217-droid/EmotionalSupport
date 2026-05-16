import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Gemini setup helper
let aiClient: any = null;
function getAi() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

app.use(express.json());

// API routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    hasKey: !!process.env.GEMINI_API_KEY,
    keyLength: process.env.GEMINI_API_KEY?.length || 0
  });
});

app.post("/api/gemini/chat", async (req, res) => {
  const { history, message, systemInstruction, tools } = req.body;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing from environment variables.");
    return res.status(500).json({ 
      error: {
        message: "GEMINI_API_KEY is not set on the server. Please check Settings > Secrets.",
        status: 500
      }
    });
  }

  try {
    const modelName = "gemini-3-flash-preview";
    console.log(`Calling Gemini API [${modelName}] - Message Length: ${message?.length}`);
    
    const ai = getAi();
    
    // Using generateContent with history as part of contents for maximum compatibility
    const contents = [
      ...(history || []).map((h: any) => ({
        role: h.role === 'model' ? 'model' : 'user',
        parts: h.parts.map((p: any) => p.text ? { text: p.text } : p)
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        tools: tools ? [{ functionDeclarations: tools }] : undefined
      }
    });

    // We must return a structure that the client expects
    // Extracting the pure JSON version of the response
    res.json({
      candidates: response.candidates,
      usageMetadata: response.usageMetadata
    });
  } catch (error: any) {
    console.error("Gemini API Error Detail:", {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
      apiKeyPresent: !!process.env.GEMINI_API_KEY
    });
    
    res.status(error.status || 500).json({ 
      error: {
        message: error.message || "Failed to communicate with Gemini API",
        status: error.status,
        code: error.code
      }
    });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
