import { Terminal, Download } from 'lucide-react';

function DownloadButton({ file, label, description }: { file: string; label: string; description: string }) {
  const href = `/api/download/${file}`;
  return (
    <a
      href={href}
      download={file}
      data-testid={`download-${file}`}
      className="flex items-center gap-3 bg-background border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors px-4 py-3 rounded text-left group"
    >
      <Download className="w-4 h-4 text-primary shrink-0 group-hover:scale-110 transition-transform" />
      <div>
        <div className="text-sm font-mono text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
    </a>
  );
}

export default function SetupGuide() {
  const wsUrl = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
    : 'ws://localhost/ws';

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[radial-gradient(ellipse_at_center,_hsl(var(--secondary)/0.2),_hsl(var(--background)),_hsl(var(--background)))]">
      <div className="w-20 h-20 mb-6 border border-primary/30 flex items-center justify-center bg-primary/10 rounded-full text-primary shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <Terminal className="w-10 h-10" />
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-4 tracking-tight">No Active Links</h2>
      <p className="text-muted-foreground max-w-lg text-sm mb-8">
        The mission control is waiting for active connections. Deploy the PC agent to any target machine to establish a link.
      </p>

      <div className="bg-secondary/50 border border-border p-6 rounded-md text-left w-full max-w-2xl space-y-6">
        {/* Downloads */}
        <div>
          <h3 className="text-primary font-bold mb-3 uppercase tracking-widest text-xs">Download Agent</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <DownloadButton
              file="launch.bat"
              label="launch.bat"
              description="Recommended — no Python needed, auto-installs everything"
            />
            <DownloadButton
              file="build_exe.bat"
              label="build_exe.bat"
              description="Build a standalone .exe (run once on Windows)"
            />
            <DownloadButton
              file="pc_agent.py"
              label="pc_agent.py"
              description="Raw Python script — use if you have Python installed"
            />
          </div>
        </div>

        {/* Instructions */}
        <div>
          <h3 className="text-primary font-bold mb-3 uppercase tracking-widest text-xs">Setup Instructions</h3>
          <ol className="space-y-3 text-sm text-muted-foreground list-decimal list-inside marker:text-primary">
            <li>Download <code className="bg-background px-1.5 py-0.5 rounded border border-border text-foreground">launch.bat</code> and copy it to the target Windows machine.</li>
            <li>Double-click <code className="bg-background px-1.5 py-0.5 rounded border border-border text-foreground">launch.bat</code> — it auto-downloads Python if needed.</li>
            <li>
              Paste the WebSocket URL when prompted:
              <div className="mt-2 bg-background border border-primary/30 p-3 flex items-center justify-between rounded font-mono text-xs">
                <span className="text-primary break-all select-all">{wsUrl}</span>
              </div>
            </li>
            <li>The PC appears in the sidebar once connected.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
