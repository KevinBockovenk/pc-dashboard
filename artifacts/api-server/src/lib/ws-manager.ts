import { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { logger } from "./logger";

export interface PcInfo {
  name: string;
  hostname: string;
  platform: string;
  connectedAt: string;
}

interface PendingCommand {
  resolve: (result: PcCommandResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PcCommandResult {
  success: boolean;
  data: string | null;
  image: string | null;
  error: string | null;
}

interface PcSession {
  info: PcInfo;
  socket: WebSocket;
  pending: Map<string, PendingCommand>;
}

const sessions = new Map<string, PcSession>();

let cmdCounter = 0;

export function getConnectedPcs(): PcInfo[] {
  return Array.from(sessions.values()).map((s) => s.info);
}

export function sendCommand(
  pcName: string,
  cmd: string,
  args?: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<PcCommandResult> {
  const session = sessions.get(pcName);
  if (!session) {
    return Promise.reject(new Error(`PC not found: ${pcName}`));
  }

  return new Promise((resolve, reject) => {
    const id = String(++cmdCounter);
    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(new Error("Command timed out"));
    }, timeoutMs);

    session.pending.set(id, { resolve, reject, timer });

    const payload = JSON.stringify({ id, cmd, args: args ?? {} });
    session.socket.send(payload, (err) => {
      if (err) {
        clearTimeout(timer);
        session.pending.delete(id);
        reject(err);
      }
    });
  });
}

export function attachWebSocketServer(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 100 * 1024 * 1024 });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    logger.info({ url: req.url }, "WebSocket connection opened");

    // PC agent sends a JSON register message first:
    // { type: "register", name: "...", hostname: "...", platform: "..." }
    let pcName: string | null = null;

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        logger.warn("Received non-JSON WebSocket message");
        return;
      }

      if (msg.type === "register") {
        pcName = String(msg.name ?? "unknown");
        const info: PcInfo = {
          name: pcName,
          hostname: String(msg.hostname ?? pcName),
          platform: String(msg.platform ?? "Windows"),
          connectedAt: new Date().toISOString(),
        };
        sessions.set(pcName, { info, socket: ws, pending: new Map() });
        logger.info({ pcName }, "PC registered");
        ws.send(JSON.stringify({ type: "registered", name: pcName }));
        return;
      }

      // Command result: { type: "result", id: "...", success: bool, data: ..., image: ..., error: ... }
      if (msg.type === "result" && pcName) {
        const session = sessions.get(pcName);
        if (!session) return;
        const id = String(msg.id ?? "");
        const pending = session.pending.get(id);
        if (pending) {
          clearTimeout(pending.timer);
          session.pending.delete(id);
          pending.resolve({
            success: Boolean(msg.success),
            data: msg.data != null ? String(msg.data) : null,
            image: msg.image != null ? String(msg.image) : null,
            error: msg.error != null ? String(msg.error) : null,
          });
        }
      }
    });

    ws.on("close", () => {
      if (pcName) {
        const session = sessions.get(pcName);
        if (session) {
          // Reject all pending commands
          for (const [, pending] of session.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error("PC disconnected"));
          }
        }
        sessions.delete(pcName);
        logger.info({ pcName }, "PC disconnected");
      }
    });

    ws.on("error", (err) => {
      logger.error({ err, pcName }, "WebSocket error");
    });
  });

  logger.info("WebSocket server attached at /ws");
}
