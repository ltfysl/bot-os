import { useState, useEffect } from 'react';
import type { Agent, ProviderInfo } from '../types';

interface SidebarProps {
  agents: Agent[];
  activeAgentId: string;
  onAgentSelect: (agentId: string) => void;
  onAgentsChange: () => void;
}

export default function Sidebar({
  agents,
  activeAgentId,
  onAgentSelect,
  onAgentsChange,
}: SidebarProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [showProviders, setShowProviders] = useState(false);

  useEffect(() => {
    const loadProviders = async () => {
      const providerList = await window.electronAPI.listProviders();
      setProviders(providerList);
    };
    loadProviders();
  }, []);

  const handleProviderSwitch = async (providerId: string) => {
    if (activeAgentId) {
      await window.electronAPI.updateAgentProvider(activeAgentId, providerId);
      setShowProviders(false);
      onAgentsChange();
    }
  };

  const activeAgent = agents.find((a) => a.id === activeAgentId);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">B</div>
        <button
          className="provider-toggle"
          onClick={() => setShowProviders(!showProviders)}
          title="Switch provider"
        >
          ⚙
        </button>
      </div>
      {showProviders && (
        <div className="provider-menu">
          <div className="provider-menu-header">
            {activeAgent ? `${activeAgent.name} provider` : 'Provider'}
          </div>
          {providers.map((provider) => (
            <button
              key={provider.id}
              className={`provider-menu-item ${
                activeAgent?.providerId === provider.id ? 'active' : ''
              } ${!provider.isAvailable ? 'unavailable' : ''}`}
              onClick={() => handleProviderSwitch(provider.id)}
              disabled={!provider.isAvailable}
            >
              <span>{provider.name}</span>
              {!provider.hasSecret && <span className="no-secret">🔒</span>}
            </button>
          ))}
        </div>
      )}
      <div className="agents-rail">
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={`agent-rail-item ${
              agent.id === activeAgentId ? 'active' : ''
            }`}
            onClick={() => onAgentSelect(agent.id)}
          >
            <div className="agent-rail-avatar">
              {agent.avatar}
              <div className={`agent-rail-status ${agent.status}`} />
            </div>
            <div className="agent-rail-name">{agent.name}</div>
            {agent.unread && agent.unread > 0 && (
              <div className="agent-rail-unread">{agent.unread}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
