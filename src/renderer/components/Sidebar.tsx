import type { Agent, Room } from '../types';

interface SidebarProps {
  agents: Agent[];
  rooms: Room[];
  activeAgentId: string;
  activeRoomId?: string;
  onAgentSelect: (agentId: string) => void;
  onRoomSelect: (roomId: string) => void;
  viewMode: 'chat' | 'routines' | 'room';
  onRoutinesClick: () => void;
}

export default function Sidebar({
  agents,
  rooms,
  activeAgentId,
  activeRoomId,
  onAgentSelect,
  onRoomSelect,
  viewMode,
  onRoutinesClick,
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
              agent.id === activeAgentId && viewMode === 'chat' ? 'active' : ''
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
        {rooms.length > 0 && <div className="rail-divider"></div>}
        {rooms.map((room) => (
          <button
            key={room.id}
            className={`agent-rail-item ${
              room.id === activeRoomId && viewMode === 'room' ? 'active' : ''
            }`}
            onClick={() => onRoomSelect(room.id)}
          >
            <div className="agent-rail-avatar room-avatar">
              💬
            </div>
            <div className="agent-rail-name">{room.name}</div>
            {room.unread && room.unread > 0 && (
              <div className="agent-rail-unread">{room.unread}</div>
            )}
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <button
          className={`sidebar-footer-item ${viewMode === 'routines' ? 'active' : ''}`}
          onClick={onRoutinesClick}
          title="Routines"
        >
          <span className="sidebar-footer-icon">⏰</span>
        </button>
      </div>
    </div>
  );
}
