import { useState, useEffect } from 'react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import type { Room, RoomMessage, Message } from '../types';

interface RoomViewProps {
  room: Room;
  agents: Array<{ id: string; name: string; avatar: string }>;
  onRoomUpdate?: () => void;
}

export default function RoomView({ room, agents, onRoomUpdate }: RoomViewProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadMessages();
    clearUnread();
  }, [room.id]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onRoomFanInResponse((message: RoomMessage) => {
      if (message.roomId === room.id) {
        setMessages((prev) => [...prev, message]);
        setIsLoading(false);
      } else {
        onRoomUpdate?.();
      }
    });
    return () => unsubscribe();
  }, [room.id, onRoomUpdate]);

  const loadMessages = async () => {
    const roomMessages = await window.electronAPI.getRoomMessages(room.id);
    setMessages(roomMessages);
  };

  const clearUnread = async () => {
    await window.electronAPI.clearRoomUnread(room.id);
    onRoomUpdate?.();
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const optimisticId = `${Date.now()}-optimistic`;
    const userMessage: RoomMessage = {
      id: optimisticId,
      roomId: room.id,
      content,
      role: 'user',
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    
    const hasMentions = content.includes('@');
    setIsLoading(hasMentions);

    try {
      const response = await window.electronAPI.sendRoomMessage(
        room.id, 
        content
      );
      
      setMessages((prev) => 
        prev.map((msg) => msg.id === optimisticId ? response : msg)
      );
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
      setIsLoading(false);
    }
  };

  const memberAgents = agents.filter((a) => room.memberAgentIds.includes(a.id));
  const displayedAvatars = memberAgents.slice(0, 4);
  const overflowCount = memberAgents.length - 4;

  const lastAssistantMessage = messages.slice().reverse().find(m => m.role === 'assistant');
  
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
            agentName={lastAssistantMessage?.agentName}
            agentAvatar={lastAssistantMessage?.agentAvatar}
          />
        )}
      </div>
      <MessageComposer onSend={handleSendMessage} disabled={isLoading} />
    </div>
  );
}
