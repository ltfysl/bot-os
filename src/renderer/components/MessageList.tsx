import { useEffect, useRef } from 'react';
import type { Message } from '../types';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  agentName?: string;
  agentAvatar?: string;
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

export default function MessageList({ messages, isLoading, agentName, agentAvatar }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="chat-messages">
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <div className="empty-title">No messages yet</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-messages">
      {messages.map((message) => (
        <div key={message.id} className={`message ${message.role}`}>
          <div className="message-avatar">
            {message.role === 'user' ? '👤' : '🤖'}
          </div>
          <div className="message-content">
            <div className="message-header">
              <span className="message-author">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <span className="message-time">
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <div className="message-text">{parseInlineCode(message.content)}</div>
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="message assistant">
          <div className="message-avatar">{agentAvatar || '🤖'}</div>
          <div className="message-content">
            <div className="message-header">
              <span className="message-author">{agentName || 'Assistant'}</span>
            </div>
            <div className="message-text" style={{ opacity: 0.5 }}>
              Thinking...
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
