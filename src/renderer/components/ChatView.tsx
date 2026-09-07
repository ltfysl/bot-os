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
  agentId: string;
  agentName: string;
  agentAvatar: string;
  content: string;
  timestamp: number;
}

export default function ChatView({ agent, onAgentsChange }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [showProviders, setShowProviders] = useState(false);
  const [showSecretCard, setShowSecretCard] = useState(false);
  const [secretCardProvider, setSecretCardProvider] = useState<{ id: string; name: string } | null>(null);
  const [widgetRequest, setWidgetRequest] = useState<WidgetRequest | null>(null);
  const [resolvedWidgets, setResolvedWidgets] = useState<ResolvedWidget[]>([]);
  const providerMenuRef = useRef<HTMLDivElement>(null);
  const streamingMessagesRef = useRef<Map<string, StreamingMessage>>(new Map());

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
    const unsubscribeWakeResponse = window.electronAPI.onWakeResponse((message: Message) => {
      if (message.targetAgentId === agent?.id) {
        setMessages((prev) => [...prev, message]);
      }
    });

    const unsubscribeStreamChunk = window.electronAPI.onMessageStreamChunk((chunk: StreamChunk) => {
      if (chunk.targetAgentId === agent?.id) {
        handleStreamChunk(chunk);
      }
    });

    const unsubscribeWakeStreamChunk = window.electronAPI.onWakeStreamChunk((chunk: StreamChunk) => {
      if (chunk.targetAgentId === agent?.id) {
        handleStreamChunk(chunk);
      }
    });

    const unsubscribeStreamError = window.electronAPI.onMessageStreamError((error: { id: string; agentId: string; error: string }) => {
      if (agent?.id && error.agentId === agent.id) {
        const errorMessage: Message = {
          id: error.id,
          content: `Stream error: ${error.error}`,
          role: 'assistant',
          timestamp: Date.now(),
          agentId: error.agentId,
        };
        setMessages((prev) => [...prev, errorMessage]);
        setIsLoading(false);
        streamingMessagesRef.current.delete(error.id);
      }
    });

    return () => {
      unsubscribeWakeResponse();
      unsubscribeStreamChunk();
      unsubscribeWakeStreamChunk();
      unsubscribeStreamError();
    };
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

  const handleStreamChunk = (chunk: StreamChunk) => {
    const streaming = streamingMessagesRef.current.get(chunk.id);
    
    if (!streaming) {
      const newStreaming: StreamingMessage = {
        id: chunk.id,
        agentId: chunk.agentId,
        agentName: chunk.agentName,
        agentAvatar: chunk.agentAvatar,
        content: chunk.chunk,
        timestamp: Date.now(),
      };
      streamingMessagesRef.current.set(chunk.id, newStreaming);
      
      setMessages((prev) => [...prev, {
        id: chunk.id,
        content: chunk.chunk,
        role: 'assistant',
        timestamp: newStreaming.timestamp,
        agentId: chunk.agentId,
        agentName: chunk.agentName,
        agentAvatar: chunk.agentAvatar,
      }]);
    } else {
      streaming.content += chunk.chunk;
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === chunk.id
            ? { ...msg, content: streaming.content }
            : msg
        )
      );
    }

    if (chunk.done) {
      streamingMessagesRef.current.delete(chunk.id);
      setIsLoading(false);
    }
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
    }
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
          isLoading={isLoading} 
          agentName={agent.name} 
          agentAvatar={agent.avatar}
          widgetRequest={widgetRequest}
          resolvedWidgets={resolvedWidgets}
          onWidgetResolve={handleWidgetResolve}
        />
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
