import { useState, useEffect, useRef } from 'react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import SecretRequestCard from './SecretRequestCard';
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
  const [showSecretCard, setShowSecretCard] = useState(false);
  const [secretCardProvider, setSecretCardProvider] = useState<{ id: string; name: string } | null>(null);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent) {
      loadSeedMessages(agent.id);
    }
  }, [agent?.id]);

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onWakeResponse((message: Message) => {
      if (message.targetAgentId === agent?.id) {
        setMessages((prev) => [...prev, message]);
      }
    });
    return () => unsubscribe();
  }, [agent?.id]);

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

  const handleNeedsKeyClick = (provider: ProviderInfo) => {
    setSecretCardProvider({ id: provider.id, name: provider.name });
    setShowSecretCard(true);
    setShowProviders(false);
  };

  const handleSecretSuccess = async () => {
    await loadProviders();
    onAgentsChange();
  };

  const loadProviders = async () => {
    const providerList = await window.electronAPI.listProviders();
    setProviders(providerList);
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
      const primaryResponse = await window.electronAPI.sendMessage(agent.id, content);
      setMessages((prev) => [...prev, primaryResponse]);
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
                  onClick={() => {
                    if (provider.isAvailable) {
                      handleProviderSwitch(provider.id);
                    } else {
                      handleNeedsKeyClick(provider);
                    }
                  }}
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
        <MessageList messages={messages} isLoading={isLoading} agentName={agent.name} agentAvatar={agent.avatar} />
      </div>
      <MessageComposer onSend={handleSendMessage} disabled={isLoading} />
      
      {showSecretCard && secretCardProvider && (
        <SecretRequestCard
          providerId={secretCardProvider.id}
          providerName={secretCardProvider.name}
          onClose={() => setShowSecretCard(false)}
          onSuccess={handleSecretSuccess}
        />
      )}
    </div>
  );
}
