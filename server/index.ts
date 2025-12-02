import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// CORS middleware - allow requests from Vite dev server
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow requests from Vite dev server (ports 5173, 5174, etc.)
  if (origin && (origin.includes('localhost:517') || origin.includes('127.0.0.1:517'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // If response was already sent, don't try to send again
    if (res.headersSent) {
      return _next(err);
    }

    // Return detailed error response
    console.error('[Server] Unhandled error:', {
      error: err,
      message: err.message,
      stack: err.stack,
      status,
      path: _req.path,
      method: _req.method
    });

    res.status(status).json({ 
      success: false,
      error: message,
      details: err.stack || err.details || 'No additional details available',
      type: err.constructor?.name || 'Error'
    });
  });

  // In standalone mode (when VITE_STANDALONE is set or in production), don't use Vite middleware
  // Vite dev server runs separately and proxies API requests to this server
  if (app.get("env") === "development" && !process.env.VITE_STANDALONE) {
    await setupVite(app, server);
  } else {
    // Production mode or standalone mode - serve static files or API only
    if (app.get("env") === "production") {
    serveStatic(app);
    }
    // In standalone dev mode, only serve API - Vite dev server handles frontend
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Default to 5000 if not specified.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  }).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      log(`ERROR: Port ${port} is already in use.`);
      log(`To fix this, either:`);
      log(`  1. Kill the process using port ${port}: lsof -ti:${port} | xargs kill -9`);
      log(`  2. Change the PORT in your .env file to a different port`);
      process.exit(1);
    } else {
      throw err;
    }
  });
})();
