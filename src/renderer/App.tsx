import { useState, useEffect } from 'react';
import ChatView from './components/ChatView';
import Sidebar from './components/Sidebar';
import AgentsSidebar from './components/AgentsSidebar';
import type { Channel, Agent } from './types';

function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('1');

  useEffect(() => {
    async function loadData() {
      const [channelsData, agentsData] = await Promise.all([
        window.electronAPI.getChannels(),
        window.electronAPI.getAgents(),
      ]);
      setChannels(channelsData);
      setAgents(agentsData);
    }
    loadData();
  }, []);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div className="app">
      <Sidebar
        channels={channels}
        activeChannelId={activeChannelId}
        onChannelSelect={setActiveChannelId}
      />
      <ChatView channel={activeChannel} />
      <AgentsSidebar agents={agents} />
    </div>
  );
}

export default App;
