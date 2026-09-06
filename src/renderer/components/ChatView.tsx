import { useState, useEffect, useRef } from 'react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import type { Agent, Message, ProviderInfo } from '../types';

interface ChatViewProps {
  agent?: Agent;
  onAgentsChange: () => void;
}

export default function ChatView({ agent, onAgentsChange }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [showProviders, setShowProviders] = useState(false);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent) {
      loadSeedMessages(agent.id);
    }
  }, [agent?.id]);

  useEffect(() => {
    const loadProviders = async () => {
      const providerList = await window.electronAPI.listProviders();
      setProviders(providerList);
    };
    loadProviders();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(event.target as Node)) {
        setShowProviders(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProviders(false);
      }
    };

    if (showProviders) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showProviders]);

  const handleProviderSwitch = async (providerId: string) => {
    if (agent) {
      await window.electronAPI.updateAgentProvider(agent.id, providerId);
      setShowProviders(false);
      onAgentsChange();
    }
  };

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
      const result = await window.electronAPI.sendMessage(agent.id, content);
      
      setMessages((prev) => [...prev, result.primary]);
      
      if (result.wakeResults && result.wakeResults.length > 0) {
        const wakeMessages = result.wakeResults.map((wr) => ({
          ...wr.response,
          content: `[${wr.wokeAgentName}] ${wr.response.content}`,
        }));
        setMessages((prev) => [...prev, ...wakeMessages]);
      }
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
        <div ref={providerMenuRef} className="provider-toggle-wrapper">
          <button
            className="provider-toggle"
            onClick={() => setShowProviders(!showProviders)}
            title="Switch provider"
          >
            ⚙
          </button>
          {showProviders && (
            <div className="provider-menu">
              <div className="provider-menu-header">
                {agent.name} provider
              </div>
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  className={`provider-menu-item ${
                    agent.providerId === provider.id ? 'active' : ''
                  } ${!provider.isAvailable ? 'unavailable' : ''}`}
                  onClick={() => handleProviderSwitch(provider.id)}
                  disabled={!provider.isAvailable}
                >
                  <span>{provider.name}</span>
                  {!provider.isAvailable && <span className="needs-key">Needs key</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="chat-container">
        <MessageList messages={messages} isLoading={isLoading} />
      </div>
      <MessageComposer onSend={handleSendMessage} disabled={isLoading} />
    </div>
  );
}
