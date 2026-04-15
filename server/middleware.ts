import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

// Extend Request to carry token auth info (replaces session)
declare global {
  namespace Express {
    interface Request {
      authUserId?: number;
      authUserRole?: "admin" | "client";
      authToken?: string;
    }
  }
}

// Keep session type for backward compat (debug endpoints use it)
declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: "admin" | "client";
  }
}

/**
 * extractAuth — pulls Bearer token from Authorization header and
 * looks it up in the DB. Attaches userId/role to req if valid.
 * Does NOT reject the request — that's requireAuth's job.
 */
export function extractAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const record = storage.getToken(token);
      if (record) {
        req.authUserId = record.userId;
        req.authUserRole = record.userRole as "admin" | "client";
        req.authToken = token;
      }
    }
  }
  next();
}

/**
 * requireAuth — blocks any request that doesn't have a valid token.
 * Must be applied AFTER extractAuth.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUserId) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }
  next();
}

/**
 * requireAdmin — blocks non-admin users.
 * Must be used AFTER requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.authUserRole !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

/**
 * requireOwnerOrAdmin — ensures the requesting user owns the resource OR is an admin.
 */
export function requireOwnerOrAdmin(resourceUserId: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.authUserRole === "admin" || req.authUserId === resourceUserId) {
      return next();
    }
    return res.status(403).json({ error: "Access forbidden." });
  };
}
