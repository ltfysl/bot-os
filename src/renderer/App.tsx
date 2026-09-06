import { useState, useEffect } from 'react';
import ChatView from './components/ChatView';
import Sidebar from './components/Sidebar';
import type { Agent } from './types';

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('1');

  useEffect(() => {
    async function loadAgents() {
      const agentsData = await window.electronAPI.getAgents();
      setAgents(agentsData);
    }
    loadAgents();
  }, []);

  const activeAgent = agents.find((a) => a.id === activeAgentId);

  return (
    <div className="app">
      <Sidebar
        agents={agents}
        activeAgentId={activeAgentId}
        onAgentSelect={setActiveAgentId}
      />
      <ChatView agent={activeAgent} />
    </div>
  );
}

export default App;
