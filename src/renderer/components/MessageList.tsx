import { useEffect, useRef } from 'react';
import { User, Bot, MessageSquare, Check } from 'lucide-react';
import WidgetCard from './WidgetCard';
import type { Message, WidgetRequest } from '../types';

interface ResolvedWidget {
  id: string;
  summary: string;
  timestamp: number;
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  agentName?: string;
  agentAvatar?: string;
  widgetRequest?: WidgetRequest | null;
  resolvedWidgets?: ResolvedWidget[];
  onWidgetResolve?: (response: { selected: string[]; customValue?: string; dismissed: boolean }) => void;
}

function parseInlineCode(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  const regex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const codeContent = match[1];
    const isPath = codeContent.includes('/') || codeContent.includes('.');
    parts.push(
      <code key={keyCounter++} className={isPath ? 'path' : ''}>
        {codeContent}
      </code>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export default function MessageList({ messages, isLoading, agentName, agentAvatar, widgetRequest, resolvedWidgets = [], onWidgetResolve }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, widgetRequest]);

  const lastAssistantMessage = messages.filter((m) => m.role === 'assistant').at(-1);
  const hasAssistantMessage = lastAssistantMessage !== undefined;
  const useNeutralChrome = !hasAssistantMessage && !agentName && !agentAvatar;

  const showEmptyState = messages.length === 0 && !widgetRequest && !isLoading;

  const renderAvatar = (role: 'user' | 'assistant', avatarText?: string, forceNeutral = false) => {
    if (role === 'user') {
      return <User size={16} strokeWidth={2} />;
    }
    
    if (forceNeutral) {
      return <span className="agent-initials" style={{ opacity: 0.5 }}>…</span>;
    }
    
    if (avatarText && avatarText.length <= 3 && /^[A-Z]{1,3}$/.test(avatarText)) {
      return <span className="agent-initials">{avatarText}</span>;
    }
    
    return <Bot size={16} strokeWidth={2} />;
  };

  return (
    <div className="chat-messages">
      {showEmptyState && (
        <div className="empty-state">
          <MessageSquare size={32} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">No messages yet</div>
        </div>
      )}
      {messages.map((message) => {
        const displayName = message.role === 'user' 
          ? 'You' 
          : (message.agentName || 'Assistant');
        const isError = message.content.startsWith('Failed to send message:');

        return (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-avatar">
              {renderAvatar(message.role, message.agentAvatar)}
            </div>
            <div className="message-content">
              <div className="message-header">
                <span className="message-author">{displayName}</span>
                <span className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className={`message-text ${isError ? 'error' : ''}`}>
                {parseInlineCode(message.content)}
              </div>
              {message.attachments && message.attachments.length > 0 && (
                <div className="message-attachments">
                  {message.attachments.map((attachment) => (
                    <div key={attachment.id} className="message-attachment">
                      <span className="message-attachment-name">{attachment.name}</span>
                      <span className="message-attachment-size">
                        {(attachment.size / 1024).toFixed(1)}KB
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {resolvedWidgets.map((resolved) => (
        <div key={resolved.id} className="message assistant">
          <div className="message-avatar">
            {renderAvatar('assistant', lastAssistantMessage?.agentAvatar || agentAvatar)}
          </div>
          <div className="message-content">
            <div className="widget-card resolved">
              <div className="widget-resolved-header">
                <Check size={14} strokeWidth={2} className="widget-resolved-icon" />
                <span className="widget-resolved-text">{resolved.summary}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
      {widgetRequest && onWidgetResolve && (
        <div className="message assistant">
          <div className="message-avatar">
            {renderAvatar('assistant', lastAssistantMessage?.agentAvatar || agentAvatar)}
          </div>
          <div className="message-content">
            <WidgetCard request={widgetRequest} onResolve={onWidgetResolve} />
          </div>
        </div>
      )}
      {isLoading && (
        <div className="message assistant">
          <div className="message-avatar">
            {useNeutralChrome ? (
              renderAvatar('assistant', undefined, true)
            ) : (
              renderAvatar('assistant', lastAssistantMessage?.agentAvatar || agentAvatar)
            )}
          </div>
          <div className="message-content">
            <div className="message-header">
              <span className="message-author">
                {useNeutralChrome ? '…' : (lastAssistantMessage?.agentName || agentName || 'Assistant')}
              </span>
            </div>
            <div className="message-text" style={{ opacity: 0.5 }}>
              …
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
