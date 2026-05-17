import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// Increase limit for image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

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
  if (req.url.includes('/api/')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Headers: ${JSON.stringify(req.headers['x-forwarded-for'] || req.ip)}`);
  }
  next();
});

// API routes
const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  console.log(`API Router reached: ${req.method} ${req.url}`);
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
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});

apiRouter.post("/gemini/chat", async (req, res) => {
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
  res.status(404).json({ error: { message: `API endpoint not found: ${req.method} ${req.url}`, status: 404 } });
});

// JSON Error handler for API routes
apiRouter.use((err: any, req: any, res: any, next: any) => {
  console.error("API Router Error:", err);
  res.status(err.status || 500).json({ 
    error: { 
      message: err.message || "Internal server error in API router", 
      status: err.status || 500 
    } 
  });
});

// Support various prefixing common in sub-directory deployments
const apiPrefixes = ["/api", "/psychelense/api", "/psychelense/psychelense/api"];
apiPrefixes.forEach(prefix => {
  app.use(prefix, apiRouter);
});

// Helper to check if a request is likely an API request that failed
app.use((req, res, next) => {
  const isApiRequest = req.url.includes('/api/') || apiPrefixes.some(p => req.url.startsWith(p));
  if (isApiRequest) {
    console.warn(`Unmatched API request: ${req.method} ${req.url}`);
    return res.status(404).json({ 
      error: { 
        message: `API Route not found on this server: ${req.method} ${req.url}. If this is a sub-directory deployment, check BASE_URL config.`,
        path: req.url,
        status: 404,
        availablePrefixes: apiPrefixes
      } 
    });
  }
  next();
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
      // If request is for a file that wasn't found in static, it might be a SPA route
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
