import { useState, useEffect } from 'react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import type { Room, RoomMessage, Message } from '../types';

interface RoomViewProps {
  room: Room;
  agents: Array<{ id: string; name: string; avatar: string }>;
}

export default function RoomView({ room, agents }: RoomViewProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadMessages();
    window.electronAPI.clearRoomUnread(room.id);
  }, [room.id]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onRoomFanInResponse((message: RoomMessage) => {
      if (message.roomId === room.id) {
        setMessages((prev) => [...prev, message]);
      }
    });
    return () => unsubscribe();
  }, [room.id]);

  const loadMessages = async () => {
    const roomMessages = await window.electronAPI.getRoomMessages(room.id);
    setMessages(roomMessages);
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: RoomMessage = {
      id: Date.now().toString(),
      roomId: room.id,
      content,
      role: 'user',
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await window.electronAPI.sendRoomMessage(room.id, content);
      setMessages((prev) => [...prev, response]);
    } catch (error) {
      console.error('Failed to send room message:', error);
      const errorMessage: RoomMessage = {
        id: (Date.now() + 1).toString(),
        roomId: room.id,
        content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        role: 'assistant',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const memberAgents = agents.filter((a) => room.memberAgentIds.includes(a.id));
  const displayedAvatars = memberAgents.slice(0, 4);
  const overflowCount = memberAgents.length - 4;

  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  
  const messagesAsGeneric: Message[] = messages.map(msg => ({
    id: msg.id,
    content: msg.content,
    role: msg.role,
    timestamp: msg.timestamp,
    agentId: msg.agentId,
    agentName: msg.agentName,
    agentAvatar: msg.agentAvatar,
  }));

  return (
    <div className="main-content">
      <div className="chat-header">
        <span className="chat-title">{room.name}</span>
        <div className="room-members">
          {displayedAvatars.map((agent) => (
            <div key={agent.id} className="room-member-avatar" title={agent.name}>
              {agent.avatar}
            </div>
          ))}
          {overflowCount > 0 && (
            <div className="room-member-overflow" title={`${overflowCount} more`}>
              +{overflowCount}
            </div>
          )}
        </div>
      </div>
      <div className="chat-container">
        {messages.length === 0 ? (
          <div className="empty-room">No messages yet</div>
        ) : (
          <MessageList 
            messages={messagesAsGeneric} 
            isLoading={isLoading} 
            agentName={lastMessage?.agentName}
            agentAvatar={lastMessage?.agentAvatar}
          />
        )}
      </div>
      <MessageComposer onSend={handleSendMessage} disabled={isLoading} />
    </div>
  );
}
