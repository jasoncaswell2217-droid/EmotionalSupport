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
    console.log(`Initializing Gemini client with key prefix: ${apiKey.substring(0, 4)}...`);
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

// Increase limit for image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Performance and Request logging middleware
app.use((req, res, next) => {
  if (req.url.includes('/api/')) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[API] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
  }
  next();
});

// API routes
const apiRouter = express.Router();

// ... health and chat routes ...

apiRouter.get("/health", (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API || process.env.VITE_GEMINI_API_KEY;
  res.json({ 
    status: "ok", 
    hasKey: !!apiKey,
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});

apiRouter.post("/gemini/chat", async (req, res) => {
  const { history, message, systemInstruction, tools } = req.body;
  
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API || process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ 
      error: {
        message: "Gemini API key is not set. Please check your environment variables.",
        status: 500
      }
    });
  }

  try {
    const modelName = "gemini-3-flash-preview";
    console.log(`Calling Gemini API [${modelName}] - Message Length: ${message?.length}`);
    
    const ai = getAi();
    
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

    // Return the response structure expected by the client
    res.json({
      candidates: response.candidates,
      usageMetadata: response.usageMetadata,
      text: response.text || ""
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

    res.status(error.status || 500).json({ 
      error: {
        message: detailedMessage,
        status: error.status,
        code: error.code
      }
    });
  }
});

// JSON 404 for API routes
apiRouter.use((req, res) => {
  console.warn(`[API 404] ${req.method} ${req.url}`);
  res.status(404).json({ error: { message: `API endpoint not found: ${req.method} ${req.url}`, status: 404 } });
});

// JSON Error handler for API routes
apiRouter.use((err: any, req: any, res: any, next: any) => {
  console.error("API Error:", err);
  res.status(err.status || 500).json({ 
    error: { 
      message: err.message || "Internal server error", 
      status: err.status || 500 
    } 
  });
});

// Support standard API prefix
app.use("/api", apiRouter);

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
      // Don't serve index.html for API requests
      if (req.url.includes('/api/')) {
        return res.status(404).json({ error: "API Route not found" });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
