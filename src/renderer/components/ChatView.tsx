import { useState, useEffect } from 'react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import type { Channel, Message } from '../types';

interface ChatViewProps {
  channel?: Channel;
}

export default function ChatView({ channel }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMessages([]);
  }, [channel?.id]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const assistantMessage = await window.electronAPI.sendMessage(content);
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!channel) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <div className="empty-title">No Channel Selected</div>
          <div className="empty-description">
            Select a channel from the sidebar to start chatting
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="chat-header">
        <span className="channel-icon">{channel.icon}</span>
        <span className="chat-title">{channel.name}</span>
        <span className="chat-subtitle">{messages.length} messages</span>
      </div>
      <div className="chat-container">
        <MessageList messages={messages} isLoading={isLoading} />
      </div>
      <MessageComposer onSend={handleSendMessage} disabled={isLoading} />
    </div>
  );
}
