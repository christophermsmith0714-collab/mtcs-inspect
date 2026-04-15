import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Block direct access to sensitive files — always 404, never serve or fallthrough
  const blockedPaths = /^\/(\.|spcc\.db|data\/|server\/)/i;
  app.use((req, res, next) => {
    if (blockedPaths.test(req.path)) {
      return res.status(404).json({ error: "Not found" });
    }
    next();
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
