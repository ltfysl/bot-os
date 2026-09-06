import { useState, useEffect, useCallback } from 'react';
import ChatView from './components/ChatView';
import Sidebar from './components/Sidebar';
import type { Agent } from './types';

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('1');

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
        onAgentSelect={setActiveAgentId}
        onAgentsChange={loadAgents}
      />
      <ChatView agent={activeAgent} onAgentsChange={loadAgents} />
    </div>
  );
}

export default App;
