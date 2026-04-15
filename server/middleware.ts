import { Request, Response, NextFunction } from "express";

// Extend session type to include our user data
declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: "admin" | "client";
  }
}

/**
 * requireAuth — blocks any request that doesn't have an active session.
 * Apply to every route except login.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }
  next();
}

/**
 * requireAdmin — blocks non-admin users.
 * Must be used AFTER requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session || req.session.userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

/**
 * requireOwnerOrAdmin — ensures the requesting user owns the resource
 * OR is an admin. The resource's userId must be passed as a param.
 */
export function requireOwnerOrAdmin(resourceUserId: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.session.userRole === "admin" || req.session.userId === resourceUserId) {
      return next();
    }
    return res.status(403).json({ error: "Access forbidden." });
  };
}
