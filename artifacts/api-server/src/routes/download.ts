import { Router, type IRouter } from "express";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

// Resolve the workspace root relative to the compiled bundle (dist/index.mjs)
// dist/ → api-server/ → artifacts/ → workspace root
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const AGENT_DIR = path.join(workspaceRoot, "scripts", "pc-agent");

const ALLOWED: Record<
  string,
  { filename: string; mime: string; dynamic?: boolean }
> = {
  "launch.bat": {
    filename: "launch.bat",
    mime: "application/octet-stream",
    dynamic: true, // URLs injected at request time from the Host header
  },
  "pc_agent.py": {
    filename: "pc_agent.py",
    mime: "text/plain",
  },
  "build_exe.bat": {
    filename: "build_exe.bat",
    mime: "application/octet-stream",
  },
  "pc_agent.exe": {
    filename: "pc_agent.exe",
    mime: "application/octet-stream",
  },
};

router.get("/download/:file", (req, res): void => {
  const entry = ALLOWED[req.params.file];
  if (!entry) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const filePath = path.join(AGENT_DIR, entry.filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not available on server" });
    return;
  }

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${entry.filename}"`,
  );
  res.setHeader("Content-Type", entry.mime);

  // For launch.bat, replace the hardcoded URLs with the actual hostname so the
  // downloaded file always points to the server it came from.
  if (entry.dynamic) {
    const proto =
      req.secure || req.headers["x-forwarded-proto"] === "https"
        ? "https"
        : "http";
    const host =
      (req.headers["x-forwarded-host"] as string | undefined) ??
      req.headers.host ??
      "localhost";
    const baseUrl = `${proto}://${host}`;
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws";
    const agentUrl = `${baseUrl}/api/download/pc_agent.py`;

    let content = fs.readFileSync(filePath, "utf8");
    // Replace the WS_URL and AGENT_URL lines regardless of what domain was hardcoded
    content = content.replace(/^set WS_URL=.*$/m, `set WS_URL=${wsUrl}`);
    content = content.replace(
      /^set AGENT_URL=.*$/m,
      `set AGENT_URL=${agentUrl}`,
    );
    res.send(content);
    return;
  }

  res.sendFile(filePath);
});

export default router;
