import { useState, useRef, useEffect } from 'react';
import { useSendPcCommand, PcCommandInputCmd } from '@workspace/api-client-react';
import { 
  Terminal, Camera, Volume2, VolumeX, Activity, Power, RotateCcw, Moon,
  Play, Copy, ClipboardPaste, XCircle, HardDrive, FolderOpen, Unplug
} from 'lucide-react';
import FileManager from './file-manager';

type HistoryEntry = {
  id: string;
  command: string;
  timestamp: Date;
  status: 'pending' | 'success' | 'error';
  data?: string | null;
  image?: string | null;
  error?: string | null;
};

type RightPanel = 'terminal' | 'files';

export default function PcPanel({ pcName, info }: { pcName: string, info: any }) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [rightPanel, setRightPanel] = useState<RightPanel>('terminal');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { mutateAsync: sendCommand } = useSendPcCommand();

  const handleCommand = async (cmd: PcCommandInputCmd, args?: any) => {
    const id = Math.random().toString(36).substring(7);
    const entry: HistoryEntry = {
      id,
      command: cmd + (args ? ` ${JSON.stringify(args)}` : ''),
      timestamp: new Date(),
      status: 'pending'
    };
    
    setHistory(prev => [...prev, entry]);
    
    try {
      const result = await sendCommand({ pcName, data: { cmd, args } });
      setHistory(prev => prev.map(e => e.id === id ? { 
        ...e, 
        status: result.success ? 'success' : 'error',
        data: result.data,
        image: result.image,
        error: result.error
      } : e));
    } catch (err: any) {
      setHistory(prev => prev.map(e => e.id === id ? {
        ...e,
        status: 'error',
        error: err.message || 'Network error occurred.'
      } : e));
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* LEFT COLUMN: Controls */}
      <div className="w-[400px] bg-background/50 border-r border-border flex flex-col shrink-0 overflow-y-auto">
        
        {/* Header */}
        <div className="p-4 border-b border-border bg-secondary/30 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary/10 rounded text-primary">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground leading-none">{pcName}</h2>
              <span className="text-xs text-muted-foreground">{info?.hostname || 'Unknown'} • {info?.platform || 'Unknown'}</span>
            </div>
            <DisconnectButton onConfirm={() => handleCommand(PcCommandInputCmd.disconnect)} />
          </div>
        </div>

        <div className="p-4 space-y-8">
          
          {/* Quick Actions */}
          <Section title="Quick Actions">
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={Activity} label="SysInfo" onClick={() => handleCommand(PcCommandInputCmd.sysinfo)} />
              <ActionButton icon={Camera} label="Screenshot" onClick={() => handleCommand(PcCommandInputCmd.screenshot)} />
              <ActionButton icon={Terminal} label="Processes" onClick={() => handleCommand(PcCommandInputCmd.processes)} />
              <ActionButton icon={ClipboardPaste} label="Get Clipboard" onClick={() => handleCommand(PcCommandInputCmd.clipboard_get)} />
            </div>
          </Section>

          {/* Volume Controls */}
          <Section title="Audio">
            <div className="flex items-center gap-2 mb-3">
              <ActionButton icon={VolumeX} label="Mute" onClick={() => handleCommand(PcCommandInputCmd.mute)} className="flex-1" />
              <ActionButton icon={Volume2} label="Unmute" onClick={() => handleCommand(PcCommandInputCmd.unmute)} className="flex-1" />
            </div>
            <VolumeSlider onSet={(level) => handleCommand(PcCommandInputCmd.volume_set, { level })} />
          </Section>

          {/* PowerShell */}
          <Section title="PowerShell">
            <CommandForm 
              placeholder="Enter command..." 
              buttonText="Run"
              icon={Terminal}
              onSubmit={(cmd) => handleCommand(PcCommandInputCmd.cmd, { command: cmd })} 
            />
          </Section>

          {/* Open App / Path */}
          <Section title="Launch App / Path">
            <CommandForm 
              placeholder="C:\path\to\file or chrome.exe" 
              buttonText="Open"
              icon={Play}
              onSubmit={(path) => handleCommand(PcCommandInputCmd.open, { path })} 
            />
          </Section>

          {/* Kill Process */}
          <Section title="Kill Process">
            <CommandForm 
              placeholder="Process name (e.g. notepad.exe)" 
              buttonText="Kill"
              icon={XCircle}
              onSubmit={(name) => handleCommand(PcCommandInputCmd.kill_process, { name })} 
            />
          </Section>

          {/* Set Clipboard */}
          <Section title="Set Clipboard">
            <CommandForm 
              placeholder="Text to copy to PC..." 
              buttonText="Set"
              icon={Copy}
              onSubmit={(text) => handleCommand(PcCommandInputCmd.clipboard_set, { text })} 
            />
          </Section>

          {/* Power Controls */}
          <Section title="Power State" className="border-t border-border pt-6 mt-8">
            <div className="grid grid-cols-3 gap-2">
              <PowerButton icon={Power} label="Shutdown" destructive onClick={() => handleCommand(PcCommandInputCmd.shutdown)} />
              <PowerButton icon={RotateCcw} label="Restart" destructive onClick={() => handleCommand(PcCommandInputCmd.restart)} />
              <PowerButton icon={Moon} label="Sleep" onClick={() => handleCommand(PcCommandInputCmd.sleep)} />
            </div>
          </Section>

        </div>
      </div>

      {/* RIGHT COLUMN: Terminal / File Manager */}
      <div className="flex-1 flex flex-col bg-[#050505] min-w-0">
        {/* Tab bar */}
        <div className="shrink-0 flex border-b border-border bg-secondary/10">
          <TabButton
            icon={Terminal}
            label="Terminal Output"
            active={rightPanel === 'terminal'}
            onClick={() => setRightPanel('terminal')}
          />
          <TabButton
            icon={FolderOpen}
            label="File Manager"
            active={rightPanel === 'files'}
            onClick={() => setRightPanel('files')}
          />
          {rightPanel === 'terminal' && (
            <button
              onClick={() => setHistory([])}
              className="ml-auto mr-2 my-auto text-xs text-muted-foreground hover:text-foreground px-2"
            >
              Clear
            </button>
          )}
        </div>

        {rightPanel === 'terminal' ? (
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
            {history.length === 0 && (
              <div className="h-full flex items-center justify-center text-muted-foreground/50 italic">
                Awaiting commands...
              </div>
            )}
            {history.map(entry => (
              <div key={entry.id} className="border border-border/50 bg-secondary/5 rounded-sm overflow-hidden flex flex-col">
                <div className="flex justify-between items-center px-3 py-1.5 bg-secondary/20 border-b border-border/50">
                  <span className="text-primary font-bold">&gt; {entry.command}</span>
                  <span className="text-muted-foreground text-[10px]">{entry.timestamp.toLocaleTimeString()}</span>
                </div>
                <div className="p-3 whitespace-pre-wrap break-all relative">
                  {entry.status === 'pending' && (
                    <div className="flex items-center gap-2 text-primary/70 animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      Executing...
                    </div>
                  )}
                  {entry.status === 'error' && (
                    <div className="text-destructive font-bold p-2 bg-destructive/10 border border-destructive/20 rounded">
                      {entry.error || 'Unknown error occurred.'}
                    </div>
                  )}
                  {entry.data && (
                    <div className="text-foreground/90">{entry.data}</div>
                  )}
                  {entry.image && (
                    <div className="mt-2 border border-border rounded overflow-hidden relative group inline-block">
                      <img src={`data:image/png;base64,${entry.image}`} alt="Screenshot" className="max-w-full max-h-[60vh] object-contain bg-background" />
                      <a 
                        href={`data:image/png;base64,${entry.image}`} 
                        download={`screenshot-${entry.timestamp.getTime()}.png`}
                        className="absolute bottom-2 right-2 bg-background/80 border border-border text-foreground px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background"
                      >
                        Download
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <FileManager pcName={pcName} />
        )}
      </div>
    </div>
  );
}

// Subcomponents

function TabButton({ icon: Icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary font-bold'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function Section({ title, children, className = '' }: { title: string, children: React.ReactNode, className?: string }) {
  return (
    <div className={className}>
      <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 font-bold">{title}</h3>
      {children}
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, className = '' }: any) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground py-2 px-3 rounded text-xs transition-colors border border-border/50 shadow-sm ${className}`}
    >
      <Icon className="w-3.5 h-3.5 text-primary" />
      {label}
    </button>
  );
}

function DisconnectButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className="flex items-center gap-1 animate-in fade-in duration-150">
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border/50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => { setConfirm(false); onConfirm(); }}
          className="text-[10px] text-black bg-destructive hover:bg-destructive/90 font-bold px-2 py-1 rounded"
        >
          CONFIRM
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      title="Disconnect agent"
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive border border-border/50 hover:border-destructive/50 px-2 py-1.5 rounded transition-colors"
    >
      <Unplug className="w-3.5 h-3.5" />
      Disconnect
    </button>
  );
}

function PowerButton({ icon: Icon, label, onClick, destructive = false }: any) {
  const [confirm, setConfirm] = useState(false);
  
  if (confirm) {
    return (
      <div className="flex gap-1 animate-in fade-in duration-200">
        <button type="button" onClick={() => setConfirm(false)} className="flex-1 bg-secondary hover:bg-secondary/80 text-foreground py-2 rounded text-xs">Cancel</button>
        <button 
          type="button"
          onClick={() => { setConfirm(false); onClick(); }} 
          className={`flex-1 py-2 rounded text-xs font-bold text-black ${destructive ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}`}
        >
          CONFIRM
        </button>
      </div>
    );
  }
  return (
    <button 
      type="button"
      onClick={() => setConfirm(true)} 
      className="flex flex-col items-center justify-center gap-1.5 bg-secondary/50 hover:bg-secondary border border-border/50 text-foreground py-2 px-2 rounded text-xs transition-colors"
    >
      <Icon className={`w-4 h-4 ${destructive ? 'text-destructive' : 'text-primary'}`} />
      {label}
    </button>
  );
}

function CommandForm({ placeholder, buttonText, onSubmit, icon: Icon }: any) {
  const [val, setVal] = useState('');
  return (
    <form 
      onSubmit={(e) => { e.preventDefault(); if (val) { onSubmit(val); setVal(''); } }}
      className="flex gap-2"
    >
      <div className="relative flex-1">
        {Icon && <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />}
        <input 
          type="text" 
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-input border border-border rounded text-xs py-2 pr-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 text-foreground transition-all ${Icon ? 'pl-8' : 'pl-3'}`}
        />
      </div>
      <button 
        type="submit" 
        disabled={!val}
        className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-3 py-2 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      >
        {buttonText}
      </button>
    </form>
  );
}

function VolumeSlider({ onSet }: { onSet: (level: number) => void }) {
  const [val, setVal] = useState(50);
  return (
    <div className="flex items-center gap-3 bg-input border border-border p-2 rounded">
      <input 
        type="range" 
        min="0" max="100"
        value={val}
        onChange={e => setVal(parseInt(e.target.value, 10))}
        className="flex-1 h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-6 text-right">{val}%</span>
        <button 
          type="button"
          onClick={() => onSet(val)}
          className="bg-primary/20 hover:bg-primary/30 text-primary px-2 py-1 rounded text-xs font-bold transition-colors"
        >
          Set
        </button>
      </div>
    </div>
  );
}
