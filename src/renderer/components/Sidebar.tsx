import type { Agent } from '../types';

interface SidebarProps {
  agents: Agent[];
  activeAgentId: string;
  onAgentSelect: (agentId: string) => void;
}

export default function Sidebar({
  agents,
  activeAgentId,
  onAgentSelect,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">B</div>
      </div>
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
