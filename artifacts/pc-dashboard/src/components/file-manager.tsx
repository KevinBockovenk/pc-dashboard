import { useState, useRef, useEffect, useCallback } from 'react';
import { useSendPcCommand } from '@workspace/api-client-react';
import {
  Folder, FolderOpen, File, FileText, Image, Film, Music, Archive,
  HardDrive, ChevronRight, Home, RefreshCw, ArrowLeft, Upload,
  FilePlus, Pencil, Trash2, Move, Play, Eye, Save, X, Loader2,
  Download
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

type DirEntry = {
  name: string;
  type: 'file' | 'dir';
  size: number | null;
  modified: string | null;
  ext: string | null;
  isText: boolean;
};

type DriveInfo = {
  letter: string;
  label: string;
  fstype: string;
  total: number;
  free: number;
  used: number;
};

type ContextMenuState = {
  x: number;
  y: number;
  entry: DirEntry | null;
};

type DialogState =
  | { type: 'rename'; entry: DirEntry }
  | { type: 'move'; entry: DirEntry }
  | { type: 'create' }
  | { type: 'delete'; entry: DirEntry };

type MediaView = {
  kind: 'audio' | 'video';
  name: string;
  url: string; // stream URL (/api/pcs/:name/file?path=...)
};

type ImageView = {
  name: string;
  url: string; // stream URL
};

// ── Constants ──────────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'svg']);
const VIDEO_EXTS = new Set(['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'wma']);
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);

// Browser-playable subsets
const PLAYABLE_VIDEO = new Set(['mp4', 'webm', 'mov']);
const PLAYABLE_AUDIO = new Set(['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac']);
const VIEWABLE_IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

function isPlayable(entry: DirEntry): 'audio' | 'video' | null {
  const ext = entry.ext || '';
  if (PLAYABLE_VIDEO.has(ext)) return 'video';
  if (PLAYABLE_AUDIO.has(ext)) return 'audio';
  return null;
}

function isViewableImage(entry: DirEntry): boolean {
  return VIEWABLE_IMAGE.has(entry.ext || '');
}

/** Build the streaming URL for a file on a given PC */
function streamUrl(pcName: string, filePath: string): string {
  return `/api/pcs/${encodeURIComponent(pcName)}/file?path=${encodeURIComponent(filePath)}`;
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    aac: 'audio/aac', m4a: 'audio/mp4', flac: 'audio/flac',
  };
  return map[ext] || 'application/octet-stream';
}

function getFileIcon(entry: DirEntry) {
  if (entry.type === 'dir') return Folder;
  const ext = entry.ext || '';
  if (IMAGE_EXTS.has(ext)) return Image;
  if (VIDEO_EXTS.has(ext)) return Film;
  if (AUDIO_EXTS.has(ext)) return Music;
  if (ARCHIVE_EXTS.has(ext)) return Archive;
  if (entry.isText) return FileText;
  return File;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDriveSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toFixed(0)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function joinPath(base: string, name: string): string {
  const sep = base.includes('/') ? '/' : '\\';
  return base.endsWith(sep) ? base + name : base + sep + name;
}

/** Convert base64 string → Blob → object URL */
function b64ToBlobUrl(b64: string, mime: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** Trigger a browser download from base64 content */
function triggerDownload(b64: string, filename: string, mime: string) {
  const url = b64ToBlobUrl(b64, mime);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Main component ─────────────────────────────────────────────────────────

export default function FileManager({ pcName }: { pcName: string }) {
  const { mutateAsync: sendCommand } = useSendPcCommand();

  // Navigation
  const [path, setPath] = useState<string | null>(null);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File text viewer/editor
  const [fileView, setFileView] = useState<{
    path: string; name: string; content: string; isDirty: boolean; saving: boolean;
  } | null>(null);

  // Media player (stream URL — no blob)
  const [mediaView, setMediaView] = useState<MediaView | null>(null);

  // Image viewer (stream URL — no blob)
  const [imageView, setImageView] = useState<ImageView | null>(null);

  // UI state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogInput, setDialogInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const uploadRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // (no blob URLs to clean up — media and images use direct stream URLs)

  // ── Helpers ──────────────────────────────────────────────────────────────

  const showStatus = (text: string, isError = false) => {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const runCmd = useCallback(async (cmd: string, args: Record<string, unknown>) => {
    return sendCommand({ pcName, data: { cmd: cmd as any, args } });
  }, [pcName, sendCommand]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const loadDrives = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await runCmd('fs_list_drives', {});
      if (!res.success) { setError(res.error || 'Failed to list drives'); return; }
      setDrives(JSON.parse(res.data!).drives);
    } catch (e: any) { setError(e.message || 'Network error'); }
    finally { setLoading(false); }
  }, [runCmd]);

  const loadDir = useCallback(async (dirPath: string) => {
    setLoading(true); setError(null);
    try {
      const res = await runCmd('fs_list_dir', { path: dirPath });
      if (!res.success) { setError(res.error || 'Failed to list directory'); return; }
      setEntries(JSON.parse(res.data!).entries);
    } catch (e: any) { setError(e.message || 'Network error'); }
    finally { setLoading(false); }
  }, [runCmd]);

  const refresh = useCallback(() => {
    if (path === null) loadDrives(); else loadDir(path);
  }, [path, loadDrives, loadDir]);

  useEffect(() => { loadDrives(); }, [loadDrives]);

  const navigateTo = (newPath: string) => {
    setPath(newPath); setFileView(null); setMediaView(null); setImageView(null);
    setContextMenu(null); loadDir(newPath);
  };

  const navigateUp = () => {
    if (!path) return;
    const normalized = path.replace(/[\\/]+$/, '');
    const isRoot = /^[A-Za-z]:$/.test(normalized) || normalized === '';
    if (isRoot) { setPath(null); setEntries([]); loadDrives(); }
    else {
      const sep = path.includes('/') ? '/' : '\\';
      const parts = normalized.split(sep);
      parts.pop();
      navigateTo(parts.join(sep) || normalized.split(':')[0] + ':');
    }
  };

  // ── Breadcrumbs ───────────────────────────────────────────────────────────

  function buildCrumbs() {
    if (!path) return [];
    const normalized = path.replace(/[\\/]+$/, '');
    const sep = path.includes('/') ? '/' : '\\';
    const parts = normalized.split(sep);
    const crumbs: { label: string; path: string }[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      crumbs.push({ label: parts[i], path: parts.slice(0, i + 1).join(sep) });
    }
    return crumbs;
  }

  // ── File text viewer ──────────────────────────────────────────────────────

  const openTextFile = async (entry: DirEntry) => {
    if (!path || !entry.isText) return;
    const filePath = joinPath(path, entry.name);
    setActionLoading(true);
    try {
      const res = await runCmd('fs_read_file', { path: filePath });
      if (!res.success) { showStatus(res.error || 'Failed to read file', true); return; }
      setFileView({ path: filePath, name: entry.name, content: res.data || '', isDirty: false, saving: false });
    } catch (e: any) { showStatus(e.message, true); }
    finally { setActionLoading(false); }
  };

  const saveFile = async () => {
    if (!fileView) return;
    setFileView(f => f ? { ...f, saving: true } : null);
    try {
      const res = await runCmd('fs_write_file', { path: fileView.path, content: fileView.content });
      if (!res.success) showStatus(res.error || 'Save failed', true);
      else { showStatus('Saved'); setFileView(f => f ? { ...f, isDirty: false, saving: false } : null); }
    } catch (e: any) { showStatus(e.message, true); }
    finally { setFileView(f => f ? { ...f, saving: false } : null); }
  };

  // ── Media player ──────────────────────────────────────────────────────────

  // Media and images now use a direct HTTP stream URL — no large WS transfer,
  // no blob, supports Range requests so seeking works natively.
  const openMedia = (entry: DirEntry) => {
    if (!path) return;
    const kind = isPlayable(entry);
    if (!kind) return;
    const filePath = joinPath(path, entry.name);
    setMediaView({ kind, name: entry.name, url: streamUrl(pcName, filePath) });
  };

  const closeMediaView = () => setMediaView(null);

  // ── Image viewer ──────────────────────────────────────────────────────────

  const openImage = (entry: DirEntry) => {
    if (!path) return;
    const filePath = joinPath(path, entry.name);
    setImageView({ name: entry.name, url: streamUrl(pcName, filePath) });
  };

  const closeImageView = () => setImageView(null);

  // ── Download ──────────────────────────────────────────────────────────────

  const downloadEntry = async (entry: DirEntry) => {
    closeMenu();
    if (!path) return;
    const filePath = joinPath(path, entry.name);
    setActionLoading(true);

    if (entry.type === 'dir') {
      showStatus(`Zipping ${entry.name}...`);
      try {
        const res = await runCmd('fs_zip_dir', { path: filePath });
        if (!res.success) { showStatus(res.error || 'Zip failed', true); return; }
        const { content_b64, filename } = JSON.parse(res.data!);
        triggerDownload(content_b64, filename, 'application/zip');
        showStatus(`Downloaded ${filename}`);
      } catch (e: any) { showStatus(e.message, true); }
      finally { setActionLoading(false); }
    } else {
      showStatus(`Downloading ${entry.name}...`);
      try {
        const res = await runCmd('fs_download_file', { path: filePath });
        if (!res.success) { showStatus(res.error || 'Download failed', true); return; }
        const { content_b64, filename } = JSON.parse(res.data!);
        triggerDownload(content_b64, filename, getMimeType(entry.ext || ''));
        showStatus(`Downloaded ${filename}`);
      } catch (e: any) { showStatus(e.message, true); }
      finally { setActionLoading(false); }
    }
  };

  // ── Context menu actions ──────────────────────────────────────────────────

  const closeMenu = () => setContextMenu(null);

  const ctxRun = async (entry: DirEntry) => {
    closeMenu();
    if (!path) return;
    setActionLoading(true);
    try {
      const res = await runCmd('open', { path: joinPath(path, entry.name) });
      showStatus(res.success ? (res.data || 'Opened') : (res.error || 'Failed'), !res.success);
    } finally { setActionLoading(false); }
  };

  const ctxRename = (entry: DirEntry) => {
    closeMenu(); setDialogInput(entry.name); setDialog({ type: 'rename', entry });
  };
  const ctxMove = (entry: DirEntry) => {
    closeMenu();
    setDialogInput(path ? joinPath(path, entry.name) : entry.name);
    setDialog({ type: 'move', entry });
  };
  const ctxDelete = (entry: DirEntry) => { closeMenu(); setDialog({ type: 'delete', entry }); };
  const ctxCreate = () => { closeMenu(); setDialogInput(''); setDialog({ type: 'create' }); };
  const ctxUpload = () => { closeMenu(); uploadRef.current?.click(); };

  // ── Dialog actions ────────────────────────────────────────────────────────

  const submitDialog = async () => {
    if (!dialog) return;
    setActionLoading(true);
    try {
      if (dialog.type === 'rename') {
        const res = await runCmd('fs_rename', { path: joinPath(path!, dialog.entry.name), new_name: dialogInput.trim() });
        showStatus(res.success ? (res.data || 'Renamed') : (res.error || 'Failed'), !res.success);
        if (res.success) refresh();
      } else if (dialog.type === 'move') {
        const res = await runCmd('fs_move', { src: joinPath(path!, dialog.entry.name), dst: dialogInput.trim() });
        showStatus(res.success ? (res.data || 'Moved') : (res.error || 'Failed'), !res.success);
        if (res.success) refresh();
      } else if (dialog.type === 'create') {
        const res = await runCmd('fs_create_file', { path: joinPath(path!, dialogInput.trim()) });
        showStatus(res.success ? (res.data || 'Created') : (res.error || 'Failed'), !res.success);
        if (res.success) refresh();
      } else if (dialog.type === 'delete') {
        const res = await runCmd('fs_delete', { path: joinPath(path!, dialog.entry.name) });
        showStatus(res.success ? (res.data || 'Deleted') : (res.error || 'Failed'), !res.success);
        if (res.success) refresh();
      }
    } catch (e: any) { showStatus(e.message, true); }
    finally { setActionLoading(false); setDialog(null); }
  };

  // ── Upload ────────────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !path) return;
    e.target.value = '';
    setActionLoading(true);
    showStatus(`Uploading ${file.name}...`);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK)
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      const b64 = btoa(binary);
      const res = await runCmd('fs_upload_file', { dir: path, filename: file.name, content_b64: b64 });
      showStatus(res.success ? (res.data || 'Uploaded') : (res.error || 'Upload failed'), !res.success);
      if (res.success) refresh();
    } catch (e: any) { showStatus(e.message, true); }
    finally { setActionLoading(false); }
  };

  // ── Click outside to close menu ───────────────────────────────────────────

  useEffect(() => {
    const h = () => { if (contextMenu) setContextMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [contextMenu]);

  const crumbs = buildCrumbs();

  // ── Render ────────────────────────────────────────────────────────────────

  const inView = fileView || mediaView || imageView;
  const inViewName = fileView?.name ?? mediaView?.name ?? imageView?.name;

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-[#050505] text-xs font-mono select-none relative overflow-hidden">

      {/* Header / Breadcrumb */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-border bg-secondary/10">
        <button
          onClick={() => { setPath(null); setFileView(null); closeMediaView(); closeImageView(); loadDrives(); }}
          className="p-1 hover:text-primary text-muted-foreground transition-colors"
          title="Drives"
        >
          <Home className="w-3.5 h-3.5" />
        </button>
        {path && !inView && (
          <button onClick={navigateUp} className="p-1 hover:text-primary text-muted-foreground transition-colors" title="Up">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
        {inView && (
          <button
            onClick={() => { setFileView(null); closeMediaView(); closeImageView(); }}
            className="p-1 hover:text-primary text-muted-foreground transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
        {path === null ? (
          <span className="text-muted-foreground">Drives</span>
        ) : inView ? (
          <span className="text-foreground font-bold truncate">{inViewName}</span>
        ) : (
          <div className="flex items-center gap-0.5 min-w-0 flex-1 overflow-hidden">
            {crumbs.map((crumb, i) => (
              <span key={crumb.path} className="flex items-center gap-0.5 min-w-0">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                <button
                  onClick={() => navigateTo(crumb.path)}
                  className={`hover:text-primary transition-colors truncate max-w-[120px] ${i === crumbs.length - 1 ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {actionLoading && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
          {!inView && (
            <button onClick={refresh} className="p-1 hover:text-primary text-muted-foreground transition-colors" title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {fileView && (
            <button
              onClick={saveFile}
              disabled={!fileView.isDirty || fileView.saving}
              className="flex items-center gap-1 bg-primary/20 hover:bg-primary/30 text-primary px-2 py-1 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {fileView.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {statusMsg && (
        <div className={`shrink-0 px-3 py-1 text-[10px] font-bold border-b border-border ${statusMsg.isError ? 'text-destructive bg-destructive/10' : 'text-primary bg-primary/10'}`}>
          {statusMsg.text}
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {/* ── Text viewer/editor ── */}
        {fileView ? (
          <textarea
            className="flex-1 bg-[#030303] text-foreground/90 p-3 font-mono text-xs resize-none outline-none border-none focus:ring-0 leading-relaxed"
            value={fileView.content}
            onChange={e => setFileView(f => f ? { ...f, content: e.target.value, isDirty: true } : null)}
            spellCheck={false}
          />

        /* ── Image viewer ── */
        ) : imageView ? (
          <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] p-4 overflow-auto">
            <img
              src={imageView.url}
              alt={imageView.name}
              className="max-w-full max-h-full object-contain rounded shadow-2xl"
              style={{ maxHeight: 'calc(100vh - 8rem)' }}
            />
          </div>

        /* ── Media player ── */
        ) : mediaView ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-black gap-4 p-4">
            {mediaView.kind === 'video' ? (
              <video
                key={mediaView.url}
                src={mediaView.url}
                controls
                autoPlay
                className="max-w-full max-h-full rounded shadow-2xl"
                style={{ maxHeight: 'calc(100% - 2rem)' }}
              />
            ) : (
              <div className="flex flex-col items-center gap-6 w-full max-w-md">
                <div className="w-28 h-28 rounded-full border-2 border-primary/30 bg-primary/10 flex items-center justify-center">
                  <Music className="w-12 h-12 text-primary" />
                </div>
                <p className="text-foreground/80 text-sm font-bold truncate max-w-full px-4 text-center">{mediaView.name}</p>
                <audio
                  key={mediaView.url}
                  src={mediaView.url}
                  controls
                  autoPlay
                  className="w-full"
                />
              </div>
            )}
          </div>

        /* ── Loading / error / drives / directory ── */
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground/50">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />Loading...
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-destructive p-6">
            <div className="text-center opacity-80">{error}</div>
            <button onClick={refresh} className="text-muted-foreground hover:text-foreground underline text-[10px]">Retry</button>
          </div>
        ) : path === null ? (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-bold">Storage Devices</div>
            <div className="space-y-2">
              {drives.map(drive => {
                const usedPct = drive.total > 0 ? (drive.used / drive.total) * 100 : 0;
                return (
                  <button
                    key={drive.letter}
                    onClick={() => navigateTo(drive.letter + '\\')}
                    className="w-full flex items-center gap-3 bg-secondary/20 hover:bg-secondary/40 border border-border/50 rounded p-3 transition-colors text-left group"
                  >
                    <HardDrive className="w-5 h-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-bold text-foreground">{drive.letter}</span>
                        <span className="text-muted-foreground text-[10px] truncate">{drive.fstype}</span>
                        <span className="ml-auto text-muted-foreground text-[10px]">
                          {formatDriveSize(drive.free)} free of {formatDriveSize(drive.total)}
                        </span>
                      </div>
                      <div className="h-1 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${usedPct > 90 ? 'bg-destructive' : usedPct > 70 ? 'bg-yellow-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(usedPct, 100)}%` }}
                        />
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
                  </button>
                );
              })}
              {drives.length === 0 && <div className="text-center text-muted-foreground/50 py-8">No drives found</div>}
            </div>
          </div>
        ) : (
          <div
            className="flex-1 overflow-y-auto"
            onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, entry: null }); }}
          >
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 gap-1">
                <div>Empty directory</div>
                <div className="text-[10px]">Right-click to create or upload a file</div>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-secondary/20 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="text-left px-3 py-2 font-bold">Name</th>
                    <th className="text-right px-3 py-2 font-bold w-20">Size</th>
                    <th className="text-right px-3 py-2 font-bold w-28">Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(entry => {
                    const Icon = getFileIcon(entry);
                    const playable = isPlayable(entry);
                    const viewableImg = isViewableImage(entry);
                    const isClickable = entry.type === 'dir' || entry.isText || !!playable || viewableImg;
                    const iconColor = entry.type === 'dir'
                      ? 'text-primary'
                      : playable === 'video' ? 'text-purple-400'
                      : playable === 'audio' ? 'text-green-400'
                      : viewableImg ? 'text-orange-400'
                      : entry.isText ? 'text-cyan-400'
                      : 'text-muted-foreground';
                    return (
                      <tr
                        key={entry.name}
                        className="border-b border-border/30 hover:bg-secondary/20 transition-colors group"
                        style={{ cursor: isClickable ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (entry.type === 'dir') navigateTo(joinPath(path, entry.name));
                          else if (playable) openMedia(entry);
                          else if (viewableImg) openImage(entry);
                          else if (entry.isText) openTextFile(entry);
                        }}
                        onContextMenu={e => {
                          e.preventDefault(); e.stopPropagation();
                          setContextMenu({ x: e.clientX, y: e.clientY, entry });
                        }}
                      >
                        <td className="px-3 py-1.5 flex items-center gap-2 min-w-0">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                          <span className="truncate text-foreground/90 group-hover:text-foreground">{entry.name}</span>
                          {playable && (
                            <Play className="w-2.5 h-2.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                          )}
                          {viewableImg && (
                            <Eye className="w-2.5 h-2.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground whitespace-nowrap">{formatSize(entry.size)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground whitespace-nowrap">{formatDate(entry.modified)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-secondary border border-border rounded shadow-xl py-1 min-w-[170px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.entry ? (() => {
            const entry = contextMenu.entry!;
            const playable = isPlayable(entry);
            const viewableImg = isViewableImage(entry);
            return (
              <>
                {entry.type === 'dir' && (
                  <CtxItem icon={FolderOpen} label="Open" onClick={() => { closeMenu(); navigateTo(joinPath(path!, entry.name)); }} />
                )}
                {entry.type === 'file' && (
                  <CtxItem icon={Play} label="Run / Open on PC" onClick={() => ctxRun(entry)} />
                )}
                {playable && (
                  <CtxItem icon={Play} label={`Play ${playable === 'video' ? 'Video' : 'Audio'}`} onClick={() => { closeMenu(); openMedia(entry); }} />
                )}
                {viewableImg && (
                  <CtxItem icon={Eye} label="View Image" onClick={() => { closeMenu(); openImage(entry); }} />
                )}
                {entry.isText && (
                  <CtxItem icon={Eye} label="View / Edit" onClick={() => { closeMenu(); openTextFile(entry); }} />
                )}
                <CtxItem icon={Download} label={entry.type === 'dir' ? 'Download as ZIP' : 'Download'} onClick={() => downloadEntry(entry)} />
                <div className="border-t border-border/50 my-1" />
                <CtxItem icon={Pencil} label="Rename" onClick={() => ctxRename(entry)} />
                <CtxItem icon={Move} label="Move to..." onClick={() => ctxMove(entry)} />
                <div className="border-t border-border/50 my-1" />
                <CtxItem icon={Trash2} label="Delete" onClick={() => ctxDelete(entry)} danger />
              </>
            );
          })() : (
            <>
              <CtxItem icon={FilePlus} label="New File" onClick={ctxCreate} />
              {path && <CtxItem icon={Upload} label="Upload File" onClick={ctxUpload} />}
              <div className="border-t border-border/50 my-1" />
              <CtxItem icon={RefreshCw} label="Refresh" onClick={() => { closeMenu(); refresh(); }} />
            </>
          )}
        </div>
      )}

      {/* Hidden upload input */}
      <input ref={uploadRef} type="file" className="hidden" onChange={handleUpload} />

      {/* Dialog overlay */}
      {dialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-secondary border border-border rounded-lg shadow-2xl p-5 w-80">
            {dialog.type === 'delete' ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Trash2 className="w-4 h-4 text-destructive" />
                  <h3 className="font-bold text-foreground">Confirm Delete</h3>
                </div>
                <p className="text-muted-foreground mb-4 text-[11px]">
                  Delete <span className="text-foreground font-bold">{dialog.entry.name}</span>?
                  {dialog.entry.type === 'dir' && ' This will delete the entire folder and its contents.'}
                  {' '}This cannot be undone.
                </p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDialog(null)} className="px-3 py-1.5 bg-background hover:bg-secondary/80 border border-border rounded text-xs">Cancel</button>
                  <button onClick={submitDialog} disabled={actionLoading} className="px-3 py-1.5 bg-destructive hover:bg-destructive/90 text-black font-bold rounded text-xs disabled:opacity-50">
                    {actionLoading ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  {dialog.type === 'rename' && <Pencil className="w-4 h-4 text-primary" />}
                  {dialog.type === 'move' && <Move className="w-4 h-4 text-primary" />}
                  {dialog.type === 'create' && <FilePlus className="w-4 h-4 text-primary" />}
                  <h3 className="font-bold text-foreground">
                    {dialog.type === 'rename' ? `Rename ${(dialog as any).entry.name}` :
                     dialog.type === 'move' ? `Move ${(dialog as any).entry.name}` : 'New File'}
                  </h3>
                </div>
                <p className="text-muted-foreground mb-2 text-[10px]">
                  {dialog.type === 'rename' ? 'New name:' : dialog.type === 'move' ? 'Destination path:' : 'File name:'}
                </p>
                <input
                  autoFocus type="text" value={dialogInput}
                  onChange={e => setDialogInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitDialog(); if (e.key === 'Escape') setDialog(null); }}
                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary mb-4"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDialog(null)} className="px-3 py-1.5 bg-background hover:bg-secondary/80 border border-border rounded text-xs">Cancel</button>
                  <button onClick={submitDialog} disabled={actionLoading || !dialogInput.trim()} className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded text-xs disabled:opacity-50">
                    {actionLoading ? 'Working...' : 'Confirm'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CtxItem({ icon: Icon, label, onClick, danger = false }: {
  icon: React.ElementType; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-primary/10 transition-colors text-xs ${danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground'}`}
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </button>
  );
}
