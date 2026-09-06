import type { Agent } from '../types';

interface AgentsSidebarProps {
  agents: Agent[];
}

export default function AgentsSidebar({ agents }: AgentsSidebarProps) {
  return (
    <div className="agents-sidebar">
      <div className="agents-header">
        <h2 className="agents-title">Agents</h2>
      </div>
      <div className="agents-list">
        {agents.map((agent) => (
          <div key={agent.id} className="agent-item">
            <div className="agent-avatar">
              {agent.avatar}
              <div className={`agent-status ${agent.status}`} />
            </div>
            <div className="agent-info">
              <div className="agent-name">{agent.name}</div>
              <div className="agent-status-text">{agent.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
