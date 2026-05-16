import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Gemini setup
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(express.json());

// API routes
app.post("/api/gemini/chat", async (req, res) => {
  const { history, message, systemInstruction, tools } = req.body;
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ 
      error: "GEMINI_API_KEY is not set on the server. Please check Settings > Secrets." 
    });
  }

  try {
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction,
        temperature: 0.7,
        tools: tools ? [{ functionDeclarations: tools }] : undefined
      },
      history: history && history.length > 0 ? history : undefined,
    });

    const response = await chat.sendMessage({ message });
    res.json(response);
  } catch (error: any) {
    console.error("Gemini API Error:", error);
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
