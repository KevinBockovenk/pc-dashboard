import { Monitor, Cpu, Clock } from 'lucide-react';
import { PcInfo } from '@workspace/api-client-react';

interface SidebarProps {
  pcs: PcInfo[];
  selected: string | null;
  onSelect: (name: string) => void;
}

export default function Sidebar({ pcs, selected, onSelect }: SidebarProps) {
  return (
    <div className="w-64 flex flex-col bg-background/95 border-r border-border h-full shrink-0 relative z-10">
      <div className="p-4 border-b border-border bg-secondary/20">
        <h1 className="font-bold text-foreground tracking-widest uppercase text-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-[pulse_2s_ease-in-out_infinite]"></span>
          Mission Control
        </h1>
        <div className="text-xs text-muted-foreground mt-2 flex justify-between items-center">
          <span>Targets</span>
          <span className="text-primary">{pcs.length} Online</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {pcs.length === 0 && (
          <div className="text-xs text-muted-foreground/50 text-center py-4 italic">
            Scanning network...
          </div>
        )}
        
        {pcs.map(pc => (
          <button
            key={pc.name}
            onClick={() => onSelect(pc.name)}
            className={`w-full text-left p-3 rounded flex flex-col gap-2 transition-all border ${
              selected === pc.name 
                ? 'bg-primary/10 border-primary/50 text-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]' 
                : 'bg-transparent border-transparent text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Monitor className="w-4 h-4" />
                <span className="truncate">{pc.name}</span>
              </div>
              <span className={`w-1.5 h-1.5 rounded-full ${selected === pc.name ? 'bg-primary shadow-[0_0_5px_hsl(var(--primary))]' : 'bg-green-500'}`} />
            </div>
            
            <div className="flex flex-col gap-1 text-[10px] opacity-70">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3 h-3" />
                <span className="truncate">{pc.hostname} ({pc.platform})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span className="truncate">Connected {new Date(pc.connectedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
