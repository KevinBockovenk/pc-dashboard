import { Router, type IRouter } from "express";
import {
  ListPcsResponse,
  SendPcCommandParams,
  SendPcCommandBody,
  SendPcCommandResponse,
} from "@workspace/api-zod";
import { getConnectedPcs, sendCommand } from "../lib/ws-manager";

const router: IRouter = Router();

// ── MIME helpers ───────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  avi: "video/x-msvideo", mkv: "video/x-matroska", wmv: "video/x-ms-wmv",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
  aac: "audio/aac", m4a: "audio/mp4", flac: "audio/flac",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
};

function extMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

const STREAM_CHUNK = 2 * 1024 * 1024; // 2 MB per WS round-trip

// ── Streaming file proxy ────────────────────────────────────────────────────
// GET /api/pcs/:pcName/file?path=<encoded-path>
//
// Streams a file from the PC agent to the browser in 2 MB chunks using the
// fs_file_info / fs_read_chunk commands. Supports HTTP Range so browsers can
// seek audio/video without re-downloading from the start.

router.get("/pcs/:pcName/file", async (req, res): Promise<void> => {
  const pcName = String(req.params.pcName);
  const filePath = typeof req.query.path === "string" ? req.query.path : null;

  if (!filePath) {
    res.status(400).json({ error: "path query param required" });
    return;
  }

  // 1. Get file metadata
  let fileSize: number;
  let fileName: string;
  try {
    const info = await sendCommand(pcName, "fs_file_info", { path: filePath }, 10_000);
    if (!info.success) {
      res.status(404).json({ error: info.error ?? "File not found" });
      return;
    }
    const parsed = JSON.parse(info.data!) as { size: number; name: string };
    fileSize = parsed.size;
    fileName = parsed.name;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("not found") || msg.includes("not connected")) {
      res.status(404).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
    return;
  }

  const mime = extMime(fileName);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "no-store");

  // 2. Parse Range header
  let start = 0;
  let end = fileSize - 1;
  const rangeHeader = req.headers.range;

  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    if (m) {
      start = parseInt(m[1], 10);
      end = m[2] ? parseInt(m[2], 10) : Math.min(start + STREAM_CHUNK - 1, fileSize - 1);
      if (start >= fileSize) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
        return;
      }
      end = Math.min(end, fileSize - 1);
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  } else {
    res.status(200);
  }
  res.setHeader("Content-Length", String(end - start + 1));

  // 3. Send chunks
  let offset = start;
  while (offset <= end) {
    const length = Math.min(STREAM_CHUNK, end - offset + 1);
    let chunk;
    try {
      chunk = await sendCommand(pcName, "fs_read_chunk", { path: filePath, offset, length }, 30_000);
    } catch {
      res.end();
      return;
    }
    if (!chunk.success) { res.end(); return; }
    const { content_b64, bytes_read } = JSON.parse(chunk.data!) as { content_b64: string; bytes_read: number };
    res.write(Buffer.from(content_b64, "base64"));
    offset += bytes_read;
    if (bytes_read === 0) break;
  }
  res.end();
});

router.get("/pcs", async (_req, res): Promise<void> => {
  const pcs = getConnectedPcs();
  res.json(ListPcsResponse.parse({ pcs }));
});

router.post("/pcs/:pcName/command", async (req, res): Promise<void> => {
  const params = SendPcCommandParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SendPcCommandBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { pcName } = params.data;
  const { cmd, args } = body.data;

  try {
    const result = await sendCommand(
      pcName,
      cmd,
      args as Record<string, unknown> | undefined,
    );
    res.json(SendPcCommandResponse.parse(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === `PC not found: ${pcName}`) {
      res.status(404).json({ error: `PC "${pcName}" is not connected` });
    } else if (message === "Command timed out") {
      res.status(408).json({ error: "Command timed out waiting for PC response" });
    } else if (message === "PC disconnected") {
      res.status(404).json({ error: "PC disconnected before command completed" });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

export default router;
