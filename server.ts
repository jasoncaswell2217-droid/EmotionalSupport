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
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API || process.env.VITE_GEMINI_API_KEY || "";
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

// API status tracking
let lastApiError: { message: string; timestamp: number } | null = null;
let apiStats = {
  totalCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  lastCallTimestamp: 0
};

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API routes
app.get("/api/health", (req, res) => {
  console.log("Health check requested");
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API || process.env.VITE_GEMINI_API_KEY;
  res.json({ 
    status: "ok", 
    hasKey: !!apiKey,
    keyLength: apiKey?.length || 0,
    envUsed: process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : (process.env.GOOGLE_API_KEY ? 'GOOGLE_API_KEY' : (process.env.VITE_GEMINI_API ? 'VITE_GEMINI_API' : 'Other')),
    lastError: lastApiError,
    stats: apiStats,
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});

app.post("/api/gemini/chat", async (req, res) => {
  const { history, message, systemInstruction, tools } = req.body;
  apiStats.totalCalls++;
  apiStats.lastCallTimestamp = Date.now();
  
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    const errorMsg = "Gemini API key is missing from environment variables.";
    console.error(errorMsg);
    lastApiError = { message: errorMsg, timestamp: Date.now() };
    apiStats.failedCalls++;
    return res.status(500).json({ 
      error: {
        message: "Gemini API key is not set on the server. Please check Settings > Secrets and ensure GEMINI_API_KEY is defined.",
        status: 500
      }
    });
  }

  try {
    const modelName = "gemini-3-flash-preview";
    console.log(`Calling Gemini API [${modelName}] - Message Length: ${message?.length}`);
    
    const ai = getAi();
    
    // Using ai.models.generateContent directly as per modern SDK guidelines
    // Handle message as parts array (from client) or single string
    const messageParts = Array.isArray(message) 
      ? message.map((p: any) => {
          if (typeof p === 'string') return { text: p };
          if (p && typeof p === 'object') {
            if (p.text) return { text: String(p.text) };
            if (p.inlineData) return { inlineData: p.inlineData };
          }
          return p;
        })
      : [{ text: String(message) }];

    const contents = [
      ...(history || []).map((h: any) => ({
        role: h.role === 'model' ? 'model' : 'user',
        parts: (Array.isArray(h.parts) ? h.parts : [h.parts]).map((p: any) => {
          if (typeof p === 'string') return { text: p };
          if (p && typeof p === 'object') {
             if (p.text) return { text: String(p.text) };
             if (p.inlineData) return { inlineData: p.inlineData };
             if (p.functionCall) return { functionCall: p.functionCall };
             if (p.functionResponse) return { functionResponse: p.functionResponse };
          }
          return p;
        })
      })),
      { 
        role: 'user', 
        parts: messageParts
      }
    ];

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: systemInstruction ? String(systemInstruction) : undefined,
        temperature: 0.7,
        tools: tools ? [{ functionDeclarations: tools }] : undefined
      }
    });

    apiStats.successfulCalls++;

    // Return the response structure expected by the client
    // In @google/genai, .text() is a method
    const text = response.text ? (typeof response.text === 'function' ? response.text() : response.text) : "";
    
    res.json({
      candidates: response.candidates,
      usageMetadata: response.usageMetadata,
      text: text
    });
  } catch (error: any) {
    console.error("Gemini API Error Detail:", {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
      apiKeyPresent: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    });
    
    // Stringify complex error objects for better display in UI
    const detailedMessage = typeof error.message === 'string' ? error.message : JSON.stringify(error);
    lastApiError = { message: detailedMessage, timestamp: Date.now() };
    apiStats.failedCalls++;

    res.status(error.status || 500).json({ 
      error: {
        message: detailedMessage,
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
