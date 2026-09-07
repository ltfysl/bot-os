import { useState, useRef, KeyboardEvent } from 'react';
import { Paperclip, X } from 'lucide-react';
import type { Attachment } from '../types';

interface MessageComposerProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
}

export default function MessageComposer({
  onSend,
  disabled = false,
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if ((!message.trim() && attachments.length === 0) || disabled) return;
    onSend(message, attachments.length > 0 ? attachments : undefined);
    setMessage('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleAttachClick = async () => {
    try {
      const files = await window.electronAPI.pickFiles({ multiple: true });
      if (files && files.length > 0) {
        setAttachments((prev) => [...prev, ...files]);
      }
    } catch (err) {
      console.error('Failed to pick files:', err);
    }
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  };

  return (
    <div className="compose-container">
      {attachments.length > 0 && (
        <div className="compose-attachments">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="attachment-chip">
              <span className="attachment-name">{attachment.name}</span>
              <span className="attachment-size">
                {(attachment.size / 1024).toFixed(1)}KB
              </span>
              <button
                className="attachment-remove"
                onClick={() => handleRemoveAttachment(attachment.id)}
                aria-label="Remove attachment"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="compose-wrapper">
        <textarea
          ref={textareaRef}
          className="compose-input"
          placeholder="Message..."
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
        />
        <div className="compose-actions">
          <button
            className="compose-attach"
            title="Attach file"
            onClick={handleAttachClick}
            disabled={disabled}
          >
            <Paperclip size={16} strokeWidth={2} />
          </button>
          <button
            className="compose-send"
            onClick={handleSend}
            disabled={(!message.trim() && attachments.length === 0) || disabled}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
