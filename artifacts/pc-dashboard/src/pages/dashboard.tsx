import { useState } from 'react';
import { useListPcs, getListPcsQueryKey } from '@workspace/api-client-react';
import Sidebar from '../components/sidebar';
import PcPanel from '../components/pc-panel';
import SetupGuide from '../components/setup-guide';

export default function Dashboard() {
  const [selectedPc, setSelectedPc] = useState<string | null>(null);

  const { data, isLoading } = useListPcs({
    query: {
      refetchInterval: 3000,
      queryKey: getListPcsQueryKey()
    }
  });

  const pcs = data?.pcs || [];

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden font-mono text-sm">
      <Sidebar pcs={pcs} selected={selectedPc} onSelect={setSelectedPc} />
      
      <main className="flex-1 flex flex-col min-w-0 border-l border-border relative">
        {!isLoading && pcs.length === 0 ? (
          <SetupGuide />
        ) : !selectedPc ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <div className="w-16 h-16 mb-4 border border-border flex items-center justify-center bg-secondary/30 rounded-full">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">Awaiting Target Selection</h2>
            <p className="max-w-md text-center text-xs opacity-70">
              Select a connected system from the sidebar to establish a control link. 
              Real-time telemetry and command interfaces will become available.
            </p>
          </div>
        ) : (
          <PcPanel key={selectedPc} pcName={selectedPc} info={pcs.find(p => p.name === selectedPc)} />
        )}
      </main>
    </div>
  );
}
