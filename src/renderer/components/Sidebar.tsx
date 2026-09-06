import type { Channel } from '../types';

interface SidebarProps {
  channels: Channel[];
  activeChannelId: string;
  onChannelSelect: (channelId: string) => void;
}

export default function Sidebar({
  channels,
  activeChannelId,
  onChannelSelect,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">BotOS</h1>
      </div>
      <div className="channels">
        {channels.map((channel) => (
          <button
            key={channel.id}
            className={`channel-item ${
              channel.id === activeChannelId ? 'active' : ''
            }`}
            onClick={() => onChannelSelect(channel.id)}
          >
            <span className="channel-icon">{channel.icon}</span>
            <span>{channel.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
