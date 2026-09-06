import { useState, useEffect } from 'react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import type { Agent, Message } from '../types';

interface ChatViewProps {
  agent?: Agent;
}

export default function ChatView({ agent }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (agent) {
      loadSeedMessages(agent.id);
    }
  }, [agent?.id]);

  const loadSeedMessages = (agentId: string) => {
    const seedsByAgent: Record<string, Message[]> = {
      '1': [
        {
          id: 's1',
          content: 'Ready when you are',
          role: 'assistant',
          timestamp: Date.now() - 120000,
        },
      ],
      '2': [
        {
          id: 's2',
          content: 'What are we researching today?',
          role: 'assistant',
          timestamp: Date.now() - 90000,
        },
      ],
      '3': [
        {
          id: 's3',
          content: 'Standing by for code work',
          role: 'assistant',
          timestamp: Date.now() - 60000,
        },
      ],
    };
    setMessages(seedsByAgent[agentId] || []);
  };

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading || !agent) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const assistantMessage = await window.electronAPI.sendMessage(agent.id, content);
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!agent) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <div className="empty-icon">🤖</div>
          <div className="empty-title">No Agent Selected</div>
          <div className="empty-description">
            Select an agent from the sidebar
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="chat-header">
        <span className="chat-title">{agent.name}</span>
        <span className="chat-subtitle">{agent.status}</span>
      </div>
      <div className="chat-container">
        <MessageList messages={messages} isLoading={isLoading} agentName={agent.name} agentAvatar={agent.avatar} />
      </div>
      <MessageComposer onSend={handleSendMessage} disabled={isLoading} />
    </div>
  );
}
