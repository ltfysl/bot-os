import { useState, useEffect } from 'react';
import MessageList from './MessageList';
import MessageComposer from './MessageComposer';
import type { Room, RoomMessage, Message, RoomStreamChunk, WakeFailureEvent, WakeTimeoutEvent, WakeMembershipDeniedEvent, WakeBackpressureEvent } from '../types';

interface RoomViewProps {
  room: Room;
  agents: Array<{ id: string; name: string; avatar: string }>;
  onRoomUpdate?: () => void;
}

interface StreamingRoomMessage {
  id: string;
  roomId: string;
  content: string;
  role: 'assistant';
  timestamp: number;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
  isStreaming: boolean;
}

interface WakeErrorEvent {
  id: string;
  type: 'wake-failure' | 'wake-timeout' | 'wake-membership-denied';
  reason: string;
  agentName?: string;
  timestamp: number;
}

export default function RoomView({ room, agents, onRoomUpdate }: RoomViewProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<StreamingRoomMessage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTimeoutId, setLoadingTimeoutId] = useState<number | undefined>(undefined);
  const [wakeErrors, setWakeErrors] = useState<WakeErrorEvent[]>([]);
  const [backpressureState, setBackpressureState] = useState<WakeBackpressureEvent | null>(null);

  useEffect(() => {
    loadMessages();
    clearUnread();
  }, [room.id]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onRoomFanInResponse((message: RoomMessage) => {
      if (message.roomId === room.id) {
        setMessages((prev) => [...prev, message]);
        setIsLoading(false);
        setBackpressureState(null);
        if (loadingTimeoutId) {
          clearTimeout(loadingTimeoutId);
          setLoadingTimeoutId(undefined);
        }
      } else {
        onRoomUpdate?.();
      }
    });
    return () => unsubscribe();
  }, [room.id, onRoomUpdate, loadingTimeoutId]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onRoomStreamChunk((chunk: RoomStreamChunk) => {
      if (chunk.roomId === room.id) {
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
                roomId: chunk.roomId,
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
              const finalMessage: RoomMessage = {
                id: prev.id,
                roomId: prev.roomId,
                content: prev.content + chunk.chunk,
                role: prev.role,
                timestamp: prev.timestamp,
                agentId: prev.agentId,
                agentName: prev.agentName,
                agentAvatar: prev.agentAvatar,
              };
              setMessages((msgs) => [...msgs, finalMessage]);
              return null;
            } else if (!prev && chunk.chunk) {
              const finalMessage: RoomMessage = {
                id: chunk.id,
                roomId: chunk.roomId,
                content: chunk.chunk,
                role: 'assistant',
                timestamp: Date.now(),
                agentId: chunk.agentId,
                agentName: chunk.agentName,
                agentAvatar: chunk.agentAvatar,
              };
              setMessages((msgs) => [...msgs, finalMessage]);
              return null;
            }
            return prev;
          });
          setIsLoading(false);
          setBackpressureState(null);
          if (loadingTimeoutId) {
            clearTimeout(loadingTimeoutId);
            setLoadingTimeoutId(undefined);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [room.id, loadingTimeoutId]);

  useEffect(() => {
    const unsubFailure = window.electronAPI.onWakeFailure((event: WakeFailureEvent) => {
      if (event.roomId === room.id) {
        const targetAgent = agents.find((a) => a.id === event.targetAgentId);
        setWakeErrors((prev) => [...prev, {
          id: `failure-${event.timestamp}`,
          type: 'wake-failure',
          reason: formatWakeFailureReason(event.reason),
          agentName: targetAgent?.name,
          timestamp: event.timestamp,
        }]);
        setIsLoading(false);
        setBackpressureState(null);
      }
    });

    const unsubTimeout = window.electronAPI.onWakeTimeout((event: WakeTimeoutEvent) => {
      if (event.roomId === room.id) {
        const targetAgent = agents.find((a) => a.id === event.targetAgentId);
        setWakeErrors((prev) => [...prev, {
          id: `timeout-${event.timestamp}`,
          type: 'wake-timeout',
          reason: 'Timed out',
          agentName: targetAgent?.name,
          timestamp: event.timestamp,
        }]);
        setIsLoading(false);
        setBackpressureState(null);
      }
    });

    const unsubMembership = window.electronAPI.onWakeMembershipDenied((event: WakeMembershipDeniedEvent) => {
      if (event.roomId === room.id) {
        const targetAgent = agents.find((a) => a.id === event.targetAgentId);
        setWakeErrors((prev) => [...prev, {
          id: `membership-${event.timestamp}`,
          type: 'wake-membership-denied',
          reason: 'Not a member',
          agentName: targetAgent?.name,
          timestamp: event.timestamp,
        }]);
        setIsLoading(false);
        setBackpressureState(null);
      }
    });

    const unsubBackpressure = window.electronAPI.onWakeBackpressure((event: WakeBackpressureEvent) => {
      const memberAgentIds = room.memberAgentIds;
      if (memberAgentIds.includes(event.targetAgentId)) {
        setBackpressureState(event);
      }
    });

    return () => {
      unsubFailure();
      unsubTimeout();
      unsubMembership();
      unsubBackpressure();
    };
  }, [room.id, agents, room.memberAgentIds]);

  const formatWakeFailureReason = (reason: string): string => {
    switch (reason) {
      case 'agent-not-found':
        return 'Agent not found';
      case 'provider-not-found':
        return 'Provider not found';
      case 'provider-unavailable':
        return 'Provider unavailable';
      case 'membership-denied':
        return 'Not a member';
      case 'timeout':
        return 'Timed out';
      default:
        return 'Wake failed';
    }
  };

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
    setStreamingMessage(null);
    
    const mentionedAgents = extractMentions(content);
    const willWakeAgents = mentionedAgents.length > 0;
    setIsLoading(willWakeAgents);
    
    if (willWakeAgents) {
      const timeoutId = window.setTimeout(() => {
        setIsLoading(false);
        setLoadingTimeoutId(undefined);
      }, 30000);
      setLoadingTimeoutId(timeoutId);
    }

    try {
      const response = await window.electronAPI.sendRoomMessageStream(
        room.id, 
        content
      );
      
      setMessages((prev) => 
        prev.map((msg) => msg.id === optimisticId ? response : msg)
      );
      
      if (!willWakeAgents) {
        setIsLoading(false);
      }
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
      setStreamingMessage(null);
      if (loadingTimeoutId) {
        clearTimeout(loadingTimeoutId);
        setLoadingTimeoutId(undefined);
      }
    }
  };

  const handleStopStreaming = () => {
    if (streamingMessage) {
      const finalMessage: RoomMessage = {
        id: streamingMessage.id,
        roomId: streamingMessage.roomId,
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

  const extractMentions = (message: string): string[] => {
    const mentionPattern = /@(\w+)/g;
    const matches = Array.from(message.matchAll(mentionPattern));
    const mentionedNames = matches.map((m) => m[1].toLowerCase());

    const memberAgentIds: string[] = [];
    const memberAgents = agents.filter((a) => room.memberAgentIds.includes(a.id));
    
    for (const agent of memberAgents) {
      if (mentionedNames.includes(agent.name.toLowerCase())) {
        memberAgentIds.push(agent.id);
      }
    }
    
    return memberAgentIds;
  };

  const memberAgents = agents.filter((a) => room.memberAgentIds.includes(a.id));
  const displayedAvatars = memberAgents.slice(0, 4);
  const overflowCount = memberAgents.length - 4;

  const renderMemberInitials = (avatar: string) => {
    if (avatar && avatar.length <= 3 && /^[A-Z]{1,3}$/.test(avatar)) {
      return avatar;
    }
    return avatar.length >= 2 ? avatar.substring(0, 2).toUpperCase() : 'AG';
  };

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

  const streamingAsGeneric = streamingMessage ? {
    id: streamingMessage.id,
    content: streamingMessage.content,
    role: 'assistant' as const,
    timestamp: streamingMessage.timestamp,
    agentId: streamingMessage.agentId,
    agentName: streamingMessage.agentName,
    agentAvatar: streamingMessage.agentAvatar,
    isStreaming: true,
  } : null;

  return (
    <div className="main-content">
      <div className="chat-header">
        <span className="chat-title">{room.name}</span>
        <div className="room-members">
          {displayedAvatars.map((agent) => (
            <div key={agent.id} className="room-member-avatar" title={agent.name}>
              <span className="member-initials">{renderMemberInitials(agent.avatar)}</span>
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
        {messages.length === 0 && !streamingMessage ? (
          <div className="empty-room">No messages yet</div>
        ) : (
          <MessageList 
            messages={messagesAsGeneric}
            streamingMessage={streamingAsGeneric} 
            isLoading={isLoading} 
            agentName={lastAssistantMessage?.agentName}
            agentAvatar={lastAssistantMessage?.agentAvatar}
            wakeErrors={wakeErrors}
          />
        )}
      </div>
      <MessageComposer 
        onSend={handleSendMessage}
        onStop={handleStopStreaming}
        disabled={isLoading && !streamingMessage}
        isStreaming={!!streamingMessage}
        backpressureState={backpressureState}
      />
    </div>
  );
}
