import { useState, useEffect, useRef } from 'react';
import { Settings, Bot } from 'lucide-react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import SecretRequestCard from './SecretRequestCard';
import type { Agent, Message, ProviderInfo, WidgetRequest, StreamChunk } from '../types';

interface ChatViewProps {
  agent?: Agent;
  onAgentsChange: () => void;
}

interface ResolvedWidget {
  id: string;
  summary: string;
  timestamp: number;
}

interface StreamingMessage {
  id: string;
  content: string;
  role: 'assistant';
  timestamp: number;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
  isStreaming: boolean;
}

export default function ChatView({ agent, onAgentsChange }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [showProviders, setShowProviders] = useState(false);
  const [showSecretCard, setShowSecretCard] = useState(false);
  const [secretCardProvider, setSecretCardProvider] = useState<{ id: string; name: string } | null>(null);
  const [widgetRequest, setWidgetRequest] = useState<WidgetRequest | null>(null);
  const [resolvedWidgets, setResolvedWidgets] = useState<ResolvedWidget[]>([]);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent) {
      loadSeedMessages(agent.id);
    }
  }, [agent?.id]);

  const loadProviders = async () => {
    const providerList = await window.electronAPI.listProviders();
    setProviders(providerList);
  };

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
    const unsubscribe = window.electronAPI.onMessageStreamChunk((chunk: StreamChunk) => {
      if (chunk.targetAgentId === agent?.id) {
        if (!chunk.done) {
          setStreamingMessage((prev) => {
            if (prev && prev.id === chunk.id) {
              return {
                ...prev,
                content: prev.content + chunk.chunk,
              };
            } else {
              return {
                id: chunk.id,
                content: chunk.chunk,
                role: 'assistant',
                timestamp: Date.now(),
                agentId: chunk.agentId,
                agentName: chunk.agentName,
                agentAvatar: chunk.agentAvatar,
                isStreaming: true,
              };
            }
          });
        } else {
          setStreamingMessage((prev) => {
            if (prev && prev.id === chunk.id) {
              const finalMessage: Message = {
                id: prev.id,
                content: prev.content + chunk.chunk,
                role: prev.role,
                timestamp: prev.timestamp,
                agentId: prev.agentId,
                agentName: prev.agentName,
                agentAvatar: prev.agentAvatar,
              };
              setMessages((msgs) => [...msgs, finalMessage]);
              return null;
            }
            return prev;
          });
          setIsLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, [agent?.id]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onWidgetRequest((request: WidgetRequest) => {
      setWidgetRequest(request);
    });
    return () => unsubscribe();
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

  const handleNeedsKeyClick = (provider: ProviderInfo) => {
    setSecretCardProvider({ id: provider.id, name: provider.name });
    setShowSecretCard(true);
    setShowProviders(false);
  };

  const handleSecretSuccess = async () => {
    await loadProviders();
    onAgentsChange();
  };

  const handleWidgetResolve = (response: { selected: string[]; customValue?: string; dismissed: boolean }) => {
    if (!response.dismissed && widgetRequest) {
      const resolvedSummary = response.customValue?.trim() 
        ? response.customValue 
        : response.selected
            .map(id => widgetRequest.options.find(opt => opt.id === id)?.label)
            .filter(Boolean)
            .join(', ');

      setResolvedWidgets((prev) => [...prev, {
        id: widgetRequest.id,
        summary: resolvedSummary,
        timestamp: Date.now(),
      }]);
    }
    setWidgetRequest(null);
  };
  const loadSeedMessages = (agentId: string) => {
    const seedsByAgent: Record<string, Message[]> = {
      '1': [
        {
          id: 's1',
          content: 'Ready when you are',
          role: 'assistant',
          timestamp: Date.now() - 120000,
          agentAvatar: agent?.avatar,
        },
      ],
      '2': [
        {
          id: 's2',
          content: 'What are we researching today?',
          role: 'assistant',
          timestamp: Date.now() - 90000,
          agentAvatar: agent?.avatar,
        },
      ],
      '3': [
        {
          id: 's3',
          content: 'Standing by for code work',
          role: 'assistant',
          timestamp: Date.now() - 60000,
          agentAvatar: agent?.avatar,
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
    setStreamingMessage(null);

    try {
      await window.electronAPI.sendMessageStream(agent.id, content);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        role: 'assistant',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
      setStreamingMessage(null);
    }
  };

  const handleStopStreaming = () => {
    if (streamingMessage) {
      const finalMessage: Message = {
        id: streamingMessage.id,
        content: streamingMessage.content,
        role: streamingMessage.role,
        timestamp: streamingMessage.timestamp,
        agentId: streamingMessage.agentId,
        agentName: streamingMessage.agentName,
        agentAvatar: streamingMessage.agentAvatar,
      };
      setMessages((prev) => [...prev, finalMessage]);
      setStreamingMessage(null);
    }
    setIsLoading(false);
  };

  if (!agent) {
    return (
      <div className="main-content">
        <div className="empty-state">
          <Bot size={32} strokeWidth={1.5} className="empty-icon" />
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
            <Settings size={16} strokeWidth={2} />
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
        <MessageList 
          messages={messages} 
          streamingMessage={streamingMessage}
          isLoading={isLoading} 
          agentName={agent.name} 
          agentAvatar={agent.avatar}
          widgetRequest={widgetRequest}
          resolvedWidgets={resolvedWidgets}
          onWidgetResolve={handleWidgetResolve}
        />
      </div>
      <MessageComposer 
        onSend={handleSendMessage} 
        onStop={handleStopStreaming}
        disabled={isLoading && !streamingMessage}
        isStreaming={!!streamingMessage}
      />
      
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
