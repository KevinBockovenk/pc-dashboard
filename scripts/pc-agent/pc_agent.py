"""
PC Remote Control Agent for Windows
Connects to the PC Remote Control Dashboard via WebSocket.

Usage:
    python pc_agent.py wss://your-app-url/ws [--name "My PC"]
    python pc_agent.py wss://your-app-url/ws  (auto-detects PC name)
"""

import asyncio
import websockets
import websockets.exceptions
import json
import platform
import socket
import subprocess
import base64
import io
import sys
import os
import shutil
import argparse
import ctypes
from datetime import datetime

# ── Optional imports (installed by launcher/build) ──────────────────────────

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

try:
    from PIL import ImageGrab
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    from ctypes import cast, POINTER
    from comtypes import CLSCTX_ALL
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
    HAS_PYCAW = True
except Exception:
    HAS_PYCAW = False

# ── Global flags ─────────────────────────────────────────────────────────────

_disconnect_requested = False

# ── Helpers ──────────────────────────────────────────────────────────────────

def _ok(data: str) -> dict:
    return {"success": True, "data": data, "image": None, "error": None}

def _err(msg: str) -> dict:
    return {"success": False, "data": None, "image": None, "error": msg}

# ── Clipboard helpers (ctypes, no extra deps) ────────────────────────────────

def _get_clipboard() -> str:
    if platform.system() != "Windows":
        return ""
    CF_UNICODETEXT = 13
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    if not user32.OpenClipboard(0):
        return ""
    try:
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            return ""
        ptr = kernel32.GlobalLock(handle)
        try:
            return ctypes.wstring_at(ptr)
        finally:
            kernel32.GlobalUnlock(handle)
    except Exception:
        return ""
    finally:
        user32.CloseClipboard()


def _set_clipboard(text: str) -> bool:
    if platform.system() != "Windows":
        return False
    CF_UNICODETEXT = 13
    GMEM_MOVEABLE = 0x0002
    GMEM_ZEROINIT = 0x0040
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    if not user32.OpenClipboard(0):
        return False
    try:
        user32.EmptyClipboard()
        encoded = (text + "\x00").encode("utf-16-le")
        h = kernel32.GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, len(encoded))
        ptr = kernel32.GlobalLock(h)
        ctypes.memmove(ptr, encoded, len(encoded))
        kernel32.GlobalUnlock(h)
        user32.SetClipboardData(CF_UNICODETEXT, h)
        return True
    except Exception:
        return False
    finally:
        user32.CloseClipboard()

# ── Audio helpers ────────────────────────────────────────────────────────────

def _get_audio_endpoint():
    """Return pycaw IAudioEndpointVolume interface, or None."""
    if not HAS_PYCAW:
        return None
    try:
        devices = AudioUtilities.GetSpeakers()
        interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        return cast(interface, POINTER(IAudioEndpointVolume))
    except Exception:
        return None


def _set_volume(level: int) -> bool:
    """Set master volume 0–100."""
    vol_float = max(0.0, min(1.0, level / 100.0))
    ep = _get_audio_endpoint()
    if ep:
        try:
            ep.SetMasterVolumeLevelScalar(vol_float, None)
            return True
        except Exception:
            pass
    # Fallback 1: WinMM (affects wave output — may not work on all systems)
    try:
        vol_word = int(vol_float * 0xFFFF)
        vol_dword = vol_word | (vol_word << 16)
        result = ctypes.windll.winmm.waveOutSetVolume(0, vol_dword)
        if result == 0:
            return True
    except Exception:
        pass
    # Fallback 2: keyboard volume keys (each keypress = 2% step)
    try:
        VK_VOLUME_DOWN = 0xAE
        VK_VOLUME_UP = 0xAF
        KEYEVENTF_EXTENDEDKEY = 0x0001
        KEYEVENTF_KEYUP = 0x0002
        def _key(vk, flags):
            ctypes.windll.user32.keybd_event(vk, 0, flags, 0)
        # Drive volume to 0 first (50 steps down), then raise to target
        for _ in range(50):
            _key(VK_VOLUME_DOWN, KEYEVENTF_EXTENDEDKEY)
            _key(VK_VOLUME_DOWN, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP)
        steps_up = round(level / 2)
        for _ in range(steps_up):
            _key(VK_VOLUME_UP, KEYEVENTF_EXTENDEDKEY)
            _key(VK_VOLUME_UP, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP)
        return True
    except Exception:
        return False


def _set_mute(muted: bool) -> bool:
    ep = _get_audio_endpoint()
    if ep:
        try:
            ep.SetMute(1 if muted else 0, None)
            return True
        except Exception:
            pass
    # Fallback: send media mute key
    VK_VOLUME_MUTE = 0xAD
    KEYEVENTF_EXTENDEDKEY = 0x0001
    KEYEVENTF_KEYUP = 0x0002
    try:
        ctypes.windll.user32.keybd_event(VK_VOLUME_MUTE, 0, KEYEVENTF_EXTENDEDKEY, 0)
        ctypes.windll.user32.keybd_event(VK_VOLUME_MUTE, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)
        return True
    except Exception:
        return False

# ── File system helpers ──────────────────────────────────────────────────────

TEXT_EXTENSIONS = {
    'txt', 'md', 'log', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini',
    'cfg', 'conf', 'csv', 'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'htm',
    'css', 'scss', 'sass', 'less', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
    'go', 'rs', 'rb', 'php', 'sh', 'bat', 'ps1', 'sql', 'env',
    'gitignore', 'dockerfile', 'makefile', 'tex', 'rst', 'properties',
    'gradle', 'cmake', 'r', 'swift', 'kt', 'dart', 'lua', 'pl', 'vim',
}

def _is_text_file(name: str) -> bool:
    ext = os.path.splitext(name)[1].lower().lstrip('.')
    return ext in TEXT_EXTENSIONS or name.lower() in {'dockerfile', 'makefile', 'gemfile', 'procfile'}


def _entry_info(entry) -> dict:
    try:
        stat = entry.stat()
        is_dir = entry.is_dir(follow_symlinks=False)
        return {
            "name": entry.name,
            "type": "dir" if is_dir else "file",
            "size": None if is_dir else stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec='seconds'),
            "ext": os.path.splitext(entry.name)[1].lower().lstrip('.') if not is_dir else None,
            "isText": _is_text_file(entry.name) if not is_dir else False,
        }
    except Exception:
        return {"name": entry.name, "type": "file", "size": None, "modified": None, "ext": None, "isText": False}

# ── Command handlers ─────────────────────────────────────────────────────────

def handle_sysinfo(_args: dict) -> dict:
    if not HAS_PSUTIL:
        return _err("psutil not installed")
    lines = []
    cpu_pct = psutil.cpu_percent(interval=0.5)
    cpu_count = psutil.cpu_count(logical=True)
    cpu_freq = psutil.cpu_freq()
    freq_str = f" @ {cpu_freq.current:.0f} MHz" if cpu_freq else ""
    lines.append(f"CPU:    {cpu_pct:.1f}%  ({cpu_count} cores{freq_str})")
    ram = psutil.virtual_memory()
    lines.append(f"RAM:    {ram.used / 1e9:.1f} GB / {ram.total / 1e9:.1f} GB  ({ram.percent:.1f}%)")
    try:
        disk = psutil.disk_usage("C:\\")
    except Exception:
        disk = psutil.disk_usage("/")
    lines.append(f"Disk:   {disk.used / 1e9:.1f} GB / {disk.total / 1e9:.1f} GB  ({disk.percent:.1f}%)")
    boot_ts = psutil.boot_time()
    uptime_s = (datetime.now() - datetime.fromtimestamp(boot_ts)).total_seconds()
    h = int(uptime_s // 3600)
    m = int((uptime_s % 3600) // 60)
    lines.append(f"Uptime: {h}h {m}m")
    lines.append(f"Host:   {socket.gethostname()}")
    lines.append(f"OS:     {platform.platform()}")
    return _ok("\n".join(lines))


def handle_screenshot(_args: dict) -> dict:
    if not HAS_PIL:
        return _err("Pillow not installed")
    try:
        img = ImageGrab.grab()
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode()
        return {"success": True, "data": None, "image": b64, "error": None}
    except Exception as e:
        return _err(str(e))


def handle_cmd(args: dict) -> dict:
    command = args.get("command", "")
    if not command:
        return _err("No command provided")
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True, text=True, timeout=30,
        )
        output = result.stdout
        if result.stderr:
            output += ("\n" if output else "") + f"[stderr] {result.stderr}"
        return {"success": result.returncode == 0, "data": output or "(no output)",
                "image": None, "error": None if result.returncode == 0 else result.stderr}
    except subprocess.TimeoutExpired:
        return _err("Command timed out after 30s")
    except Exception as e:
        return _err(str(e))


def handle_open(args: dict) -> dict:
    path = args.get("path", "")
    if not path:
        return _err("No path provided")
    try:
        os.startfile(path)
        return _ok(f"Opened: {path}")
    except Exception as e:
        return _err(str(e))


def handle_shutdown(_args: dict) -> dict:
    try:
        subprocess.Popen(["shutdown", "/s", "/t", "5"])
        return _ok("Shutdown initiated in 5 seconds.")
    except Exception as e:
        return _err(str(e))


def handle_restart(_args: dict) -> dict:
    try:
        subprocess.Popen(["shutdown", "/r", "/t", "5"])
        return _ok("Restart initiated in 5 seconds.")
    except Exception as e:
        return _err(str(e))


def handle_sleep(_args: dict) -> dict:
    try:
        subprocess.Popen(
            ["powershell", "-Command",
             "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"]
        )
        return _ok("Sleep initiated.")
    except Exception as e:
        return _err(str(e))


def handle_clipboard_get(_args: dict) -> dict:
    try:
        text = _get_clipboard()
        return _ok(text or "(clipboard is empty)")
    except Exception as e:
        return _err(str(e))


def handle_clipboard_set(args: dict) -> dict:
    text = args.get("text", "")
    try:
        ok = _set_clipboard(text)
        if ok:
            return _ok("Clipboard updated.")
        return _err("Failed to set clipboard")
    except Exception as e:
        return _err(str(e))


def handle_volume_set(args: dict) -> dict:
    level = int(args.get("level", 50))
    level = max(0, min(100, level))
    try:
        ok = _set_volume(level)
        if ok:
            return _ok(f"Volume set to {level}%")
        return _err("Failed to set volume")
    except Exception as e:
        return _err(str(e))


def handle_mute(_args: dict) -> dict:
    try:
        ok = _set_mute(True)
        if ok:
            return _ok("Muted.")
        return _err("Failed to mute")
    except Exception as e:
        return _err(str(e))


def handle_unmute(_args: dict) -> dict:
    try:
        ok = _set_mute(False)
        if ok:
            return _ok("Unmuted.")
        return _err("Failed to unmute")
    except Exception as e:
        return _err(str(e))


def handle_processes(_args: dict) -> dict:
    if not HAS_PSUTIL:
        return _err("psutil not installed")
    try:
        procs = []
        for p in sorted(psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]),
                         key=lambda x: x.info.get("cpu_percent") or 0, reverse=True)[:50]:
            try:
                mem_mb = (p.info.get("memory_info") or type("m", (), {"rss": 0})()).rss / 1e6
                cpu = p.info.get("cpu_percent") or 0.0
                procs.append(f"{p.info['pid']:>6}  {cpu:>5.1f}%  {mem_mb:>7.1f} MB  {p.info['name']}")
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        header = f"{'PID':>6}  {'CPU':>5}   {'Memory':>8}   Name\n" + "-" * 55
        return _ok(header + "\n" + "\n".join(procs))
    except Exception as e:
        return _err(str(e))


def handle_kill_process(args: dict) -> dict:
    name = args.get("name", "")
    if not name:
        return _err("No process name provided")
    if not HAS_PSUTIL:
        return _err("psutil not installed")
    killed = []
    errors = []
    for p in psutil.process_iter(["pid", "name"]):
        try:
            if p.info["name"].lower() == name.lower():
                p.kill()
                killed.append(str(p.info["pid"]))
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            errors.append(str(e))
    if killed:
        return _ok(f"Killed {len(killed)} process(es) matching '{name}': PIDs {', '.join(killed)}")
    if errors:
        return _err(f"Could not kill '{name}': {'; '.join(errors)}")
    return _err(f"No process named '{name}' found")


def handle_disconnect(_args: dict) -> dict:
    global _disconnect_requested
    _disconnect_requested = True
    return _ok("Agent disconnecting. The agent process will now exit.")


def handle_fs_list_drives(_args: dict) -> dict:
    if not HAS_PSUTIL:
        return _err("psutil not installed")
    try:
        drives = []
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                drives.append({
                    "letter": part.mountpoint.rstrip("\\"),
                    "label": part.device,
                    "fstype": part.fstype,
                    "total": usage.total,
                    "free": usage.free,
                    "used": usage.used,
                })
            except Exception:
                drives.append({
                    "letter": part.mountpoint.rstrip("\\"),
                    "label": part.device,
                    "fstype": part.fstype,
                    "total": 0, "free": 0, "used": 0,
                })
        return _ok(json.dumps({"drives": drives}))
    except Exception as e:
        return _err(str(e))


def handle_fs_list_dir(args: dict) -> dict:
    path = args.get("path", "")
    if not path:
        return _err("No path provided")
    try:
        entries = []
        with os.scandir(path) as it:
            for entry in it:
                try:
                    entries.append(_entry_info(entry))
                except Exception:
                    pass
        # Sort: dirs first, then by name
        entries.sort(key=lambda e: (0 if e["type"] == "dir" else 1, e["name"].lower()))
        return _ok(json.dumps({"path": path, "entries": entries}))
    except PermissionError:
        return _err(f"Access denied: {path}")
    except FileNotFoundError:
        return _err(f"Path not found: {path}")
    except Exception as e:
        return _err(str(e))


def handle_fs_move(args: dict) -> dict:
    src = args.get("src", "")
    dst = args.get("dst", "")
    if not src or not dst:
        return _err("src and dst are required")
    try:
        # If dst is a directory, move src into it
        if os.path.isdir(dst):
            dst = os.path.join(dst, os.path.basename(src))
        shutil.move(src, dst)
        return _ok(f"Moved to: {dst}")
    except Exception as e:
        return _err(str(e))


def handle_fs_delete(args: dict) -> dict:
    path = args.get("path", "")
    if not path:
        return _err("No path provided")
    try:
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.unlink(path)
        return _ok(f"Deleted: {path}")
    except Exception as e:
        return _err(str(e))


def handle_fs_rename(args: dict) -> dict:
    path = args.get("path", "")
    new_name = args.get("new_name", "")
    if not path or not new_name:
        return _err("path and new_name are required")
    try:
        parent = os.path.dirname(path)
        new_path = os.path.join(parent, new_name)
        os.rename(path, new_path)
        return _ok(f"Renamed to: {new_name}")
    except Exception as e:
        return _err(str(e))


def handle_fs_read_file(args: dict) -> dict:
    path = args.get("path", "")
    if not path:
        return _err("No path provided")
    try:
        size = os.path.getsize(path)
        if size > 2 * 1024 * 1024:  # 2 MB limit
            return _err(f"File too large to view ({size // 1024} KB). Limit is 2 MB.")
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        return _ok(content)
    except PermissionError:
        return _err(f"Access denied: {path}")
    except Exception as e:
        return _err(str(e))


def handle_fs_write_file(args: dict) -> dict:
    path = args.get("path", "")
    content = args.get("content", "")
    if not path:
        return _err("No path provided")
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return _ok(f"Saved: {path}")
    except PermissionError:
        return _err(f"Access denied: {path}")
    except Exception as e:
        return _err(str(e))


def handle_fs_create_file(args: dict) -> dict:
    path = args.get("path", "")
    if not path:
        return _err("No path provided")
    try:
        if os.path.exists(path):
            return _err(f"Already exists: {os.path.basename(path)}")
        with open(path, "x", encoding="utf-8") as _:
            pass
        return _ok(f"Created: {os.path.basename(path)}")
    except Exception as e:
        return _err(str(e))


def handle_fs_upload_file(args: dict) -> dict:
    directory = args.get("dir", "")
    filename = args.get("filename", "")
    content_b64 = args.get("content_b64", "")
    if not directory or not filename:
        return _err("dir and filename are required")
    try:
        dest = os.path.join(directory, filename)
        data = base64.b64decode(content_b64)
        with open(dest, "wb") as f:
            f.write(data)
        return _ok(f"Uploaded {filename} ({len(data):,} bytes) to {directory}")
    except Exception as e:
        return _err(str(e))


def handle_fs_download_file(args: dict) -> dict:
    """Read any file in binary mode and return base64-encoded content."""
    path = args.get("path", "")
    if not path:
        return _err("path is required")
    try:
        with open(path, "rb") as f:
            data = f.read()
        content_b64 = base64.b64encode(data).decode()
        filename = os.path.basename(path)
        import json as _json
        return _ok(_json.dumps({"content_b64": content_b64, "filename": filename, "size": len(data)}))
    except Exception as e:
        return _err(str(e))


def handle_fs_file_info(args: dict) -> dict:
    """Return size and name for a file path (used by the streaming proxy)."""
    import pathlib, json as _json
    path = args.get("path", "")
    if not path:
        return _err("path is required")
    try:
        p = pathlib.Path(path)
        if not p.is_file():
            return _err(f"Not a file: {path}")
        stat = p.stat()
        return _ok(_json.dumps({"size": stat.st_size, "name": p.name}))
    except Exception as e:
        return _err(str(e))


def handle_fs_read_chunk(args: dict) -> dict:
    """Read a byte range from a file and return base64-encoded content."""
    import json as _json
    path = args.get("path", "")
    offset = int(args.get("offset", 0))
    length = int(args.get("length", 2 * 1024 * 1024))
    if not path:
        return _err("path is required")
    try:
        with open(path, "rb") as f:
            f.seek(offset)
            data = f.read(length)
        return _ok(_json.dumps({
            "content_b64": base64.b64encode(data).decode(),
            "bytes_read": len(data),
        }))
    except Exception as e:
        return _err(str(e))


def handle_fs_zip_dir(args: dict) -> dict:
    """Zip an entire directory in memory and return base64-encoded zip content."""
    import zipfile, io as _io, json as _json
    path = args.get("path", "")
    if not path:
        return _err("path is required")
    if not os.path.isdir(path):
        return _err(f"Not a directory: {path}")
    try:
        buf = _io.BytesIO()
        dirname = os.path.basename(path.rstrip("\\/"))
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _dirs, files in os.walk(path):
                for file in files:
                    abs_path = os.path.join(root, file)
                    arc_name = os.path.relpath(abs_path, os.path.dirname(path))
                    zf.write(abs_path, arc_name)
        zip_bytes = buf.getvalue()
        content_b64 = base64.b64encode(zip_bytes).decode()
        filename = dirname + ".zip"
        return _ok(_json.dumps({"content_b64": content_b64, "filename": filename, "size": len(zip_bytes)}))
    except Exception as e:
        return _err(str(e))


HANDLERS = {
    "sysinfo":        handle_sysinfo,
    "screenshot":     handle_screenshot,
    "cmd":            handle_cmd,
    "open":           handle_open,
    "shutdown":       handle_shutdown,
    "restart":        handle_restart,
    "sleep":          handle_sleep,
    "clipboard_get":  handle_clipboard_get,
    "clipboard_set":  handle_clipboard_set,
    "volume_set":     handle_volume_set,
    "mute":           handle_mute,
    "unmute":         handle_unmute,
    "processes":      handle_processes,
    "kill_process":   handle_kill_process,
    "disconnect":     handle_disconnect,
    "fs_list_drives": handle_fs_list_drives,
    "fs_list_dir":    handle_fs_list_dir,
    "fs_move":        handle_fs_move,
    "fs_delete":      handle_fs_delete,
    "fs_rename":      handle_fs_rename,
    "fs_read_file":   handle_fs_read_file,
    "fs_write_file":  handle_fs_write_file,
    "fs_create_file": handle_fs_create_file,
    "fs_upload_file": handle_fs_upload_file,
    "fs_download_file": handle_fs_download_file,
    "fs_zip_dir":       handle_fs_zip_dir,
    "fs_file_info":     handle_fs_file_info,
    "fs_read_chunk":    handle_fs_read_chunk,
}

# ── WebSocket client ─────────────────────────────────────────────────────────

async def run_agent(ws_url: str, name: str):
    global _disconnect_requested
    print(f"[PC Agent] Connecting to {ws_url} ...")
    while True:
        try:
            async with websockets.connect(
                ws_url,
                ping_interval=20,
                ping_timeout=20,
                max_size=50 * 1024 * 1024,  # 50 MB — default 1 MB kills large uploads
            ) as ws:
                # Register
                reg = json.dumps({
                    "type": "register",
                    "name": name,
                    "hostname": socket.gethostname(),
                    "platform": platform.system(),
                })
                await ws.send(reg)
                print(f"[PC Agent] Registered as '{name}'")

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    if msg.get("type") == "registered":
                        print(f"[PC Agent] Server acknowledged registration.")
                        continue

                    cmd_id = msg.get("id")
                    cmd = msg.get("cmd")
                    args = msg.get("args") or {}

                    if not cmd:
                        continue

                    print(f"[PC Agent] Running command: {cmd}")
                    handler = HANDLERS.get(cmd)
                    if handler:
                        try:
                            # Run in a thread so blocking I/O (large file writes, etc.)
                            # doesn't stall the event loop and kill the ping/pong.
                            result = await asyncio.to_thread(handler, args)
                        except Exception as e:
                            result = _err(str(e))
                    else:
                        result = _err(f"Unknown command: {cmd}")

                    response = json.dumps({"type": "result", "id": cmd_id, **result})
                    await ws.send(response)

                    # Handle disconnect after sending the final response
                    if _disconnect_requested:
                        _disconnect_requested = False
                        print("[PC Agent] Disconnect command received. Exiting...")
                        await ws.close()
                        os._exit(0)

        except (websockets.exceptions.ConnectionClosed,
                websockets.exceptions.WebSocketException,
                OSError) as e:
            print(f"[PC Agent] Disconnected: {e}. Reconnecting in 5s...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"[PC Agent] Unexpected error: {e}. Reconnecting in 5s...")
            await asyncio.sleep(5)


def main():
    # ── Single-instance guard (Windows named mutex) ───────────────────────────
    # Holds the mutex handle alive for the lifetime of this process.
    # A second instance will see ERROR_ALREADY_EXISTS (183) and exit immediately.
    _mutex_handle = None
    if platform.system() == "Windows":
        _mutex_handle = ctypes.windll.kernel32.CreateMutexW(None, False, "Global\\PCAgentSingleInstance")
        if ctypes.windll.kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            print("[PC Agent] Another instance is already running. Exiting.")
            sys.exit(0)
    # ─────────────────────────────────────────────────────────────────────────

    parser = argparse.ArgumentParser(description="PC Remote Control Agent")
    parser.add_argument("url", nargs="?", help="WebSocket URL (e.g. wss://your-app/ws)")
    parser.add_argument("--name", default=None,
                        help="Display name for this PC (default: hostname)")
    args = parser.parse_args()

    if not args.url:
        url = input("WebSocket URL (e.g. wss://your-app/ws): ").strip()
    else:
        url = args.url

    if not url:
        print("Error: WebSocket URL required.")
        sys.exit(1)

    pc_name = args.name or socket.gethostname()

    print(f"[PC Agent] Starting agent for '{pc_name}'")
    print(f"[PC Agent] psutil: {'YES' if HAS_PSUTIL else 'NO'}")
    print(f"[PC Agent] Pillow: {'YES' if HAS_PIL else 'NO'}")
    print(f"[PC Agent] pycaw:  {'YES' if HAS_PYCAW else 'NO'}")
    print(f"[PC Agent] Press Ctrl+C to stop.")

    asyncio.run(run_agent(url, pc_name))


if __name__ == "__main__":
    main()
