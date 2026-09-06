import { useState, useEffect, useCallback } from 'react';
import ChatView from './components/ChatView';
import Sidebar from './components/Sidebar';
import RoutinesView from './components/RoutinesView';
import type { Agent } from './types';

type ViewMode = 'chat' | 'routines';

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('1');
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  const loadAgents = useCallback(async () => {
    const agentsData = await window.electronAPI.getAgents();
    setAgents(agentsData);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const activeAgent = agents.find((a) => a.id === activeAgentId);

  return (
    <div className="app">
      <Sidebar
        agents={agents}
        activeAgentId={activeAgentId}
        onAgentSelect={(id) => {
          setActiveAgentId(id);
          setViewMode('chat');
        }}
        viewMode={viewMode}
        onRoutinesClick={() => setViewMode('routines')}
      />
      <div style={{ display: viewMode === 'chat' ? 'flex' : 'none', flex: 1, minWidth: 0 }}>
        <ChatView agent={activeAgent} onAgentsChange={loadAgents} />
      </div>
      {viewMode === 'routines' && (
        <RoutinesView onClose={() => setViewMode('chat')} />
      )}
    </div>
  );
}

export default App;
