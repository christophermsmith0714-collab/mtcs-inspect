import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes, registerHealthCheck } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

// ── Validate required env vars at startup ───────────────────────────────────
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET env var must be set (min 32 chars). Run: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
}

const app = express();
const httpServer = createServer(app);

// ── Trust proxy (for Railway/Render/Heroku) ──────────────────────────────────
app.set("trust proxy", 1);

// ── Security headers (helmet) ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Disabled — Vite injects inline scripts that would be blocked
  crossOriginEmbedderPolicy: false, // Needed for iframe embedding on Perplexity
}));

// ── Sessions ─────────────────────────────────────────────────────────────────
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,       // Not accessible via JS (XSS protection)
    sameSite: "lax",      // CSRF protection; "strict" breaks cross-origin iframe
    maxAge: 8 * 60 * 60 * 1000, // 8-hour sessions
    secure: process.env.NODE_ENV === "production", // HTTPS on Railway/Render
  },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Strict limit on login — prevents brute force (10 attempts / 15 min)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes before trying again." },
});

// General API limit — 300 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

app.use("/api/", apiLimiter);

// ── Body parsing ──────────────────────────────────────────────────────────────
// Default 1MB for all routes
app.use(express.json({
  limit: "1mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// ── Request logger ────────────────────────────────────────────────────────────
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Don't log full bodies in production (may contain passwords/photos)
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });
  next();
});

// ── Attach loginLimiter so routes.ts can apply it ─────────────────────────────
(app as any).__loginLimiter = loginLimiter;

(async () => {
  registerHealthCheck(app);
  await registerRoutes(httpServer, app);

  // ── Error handler ──────────────────────────────────────────────────────────
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    console.error("Internal Server Error:", err);
    if (res.headersSent) return next(err);
    // Never leak stack traces in production
    const message = process.env.NODE_ENV === "production"
      ? "Internal Server Error"
      : (err.message || "Internal Server Error");
    return res.status(status).json({ error: message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen({ port, host: "0.0.0.0", reusePort: true }, () => {
    log(`serving on port ${port}`);
  });
})();
