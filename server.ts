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
  const start = Date.now();
  const isApi = req.url.includes('/api/');
  
  if (isApi) {
    console.log(`[INCOMING] ${req.method} ${req.url}`);
  }
  
  res.on('finish', () => {
    if (isApi || res.statusCode >= 400) {
      const duration = Date.now() - start;
      console.log(`[RESPONSE] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API routes
const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  console.log(`[API ROUTER MATCHED] ${req.method} ${req.url}`);
  next();
});

// ... health and chat routes ...

apiRouter.get("/health", (req, res) => {
  console.log("Health check requested");
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GEMINI_API || process.env.VITE_GEMINI_API_KEY;
  res.json({ 
    status: "ok", 
    hasKey: !!apiKey,
    keyLength: apiKey?.length || 0,
    envUsed: process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : (process.env.GOOGLE_API_KEY ? 'GOOGLE_API_KEY' : (process.env.VITE_GEMINI_API ? 'VITE_GEMINI_API' : 'Other')),
    lastError: lastApiError,
    stats: apiStats,
    nodeEnv: process.env.NODE_ENV || 'development',
    serverTime: new Date().toISOString()
  });
});

apiRouter.post("/gemini/chat", async (req, res) => {
  console.log("!!! Gemini Chat Route Triggered !!!");
  const { history, message, systemInstruction, tools } = req.body;
  
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

// JSON 404 for API routes
apiRouter.use((req, res) => {
  console.warn(`[API 404] ${req.method} ${req.url}`);
  res.status(404).json({ error: { message: `API endpoint not found: ${req.method} ${req.url}`, status: 404 } });
});

// JSON Error handler for API routes
apiRouter.use((err: any, req: any, res: any, next: any) => {
  console.error("[API ERROR]", err);
  res.status(err.status || 500).json({ 
    error: { 
      message: err.message || "Internal server error in API router", 
      status: err.status || 500 
    } 
  });
});

// Improved Prefix handling: match /api regardless of what comes before it in the path
app.use((req, res, next) => {
  const url = req.url;
  // If it's an API call, we want to make sure it gets to the apiRouter
  // Even if the prefix is slightly different than expected
  if (url.includes('/api/')) {
    console.log(`[ROUTING] API path detected: ${url}`);
    
    // If it's like /psychelense/api/..., strip the /psychelense/ prefix for the router
    if (url.startsWith('/psychelense/api/')) {
       req.url = url.replace('/psychelense', '');
       console.log(`[ROUTING] Rewrote URL to: ${req.url}`);
       return apiRouter(req, res, next);
    }
  }
  next();
});

const apiPrefixes = ["/api", "/psychelense/api"];
apiPrefixes.forEach(prefix => {
  app.use(prefix, apiRouter);
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
    // Serve static files from the root and the subdirectory
    app.use(express.static(distPath));
    app.use('/psychelense', express.static(distPath));
    
    app.get('*', (req, res) => {
      // Avoid serving index.html for API requests that were never matched
      if (req.url.includes('/api/')) {
        console.warn(`[API 404 Catch-all] ${req.method} ${req.url}`);
        return res.status(404).json({ 
          error: { 
            message: `API Route not found: ${req.method} ${req.url}`, 
            status: 404,
            suggestion: "Check if the server is omitting the base path in API requests"
          } 
        });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
