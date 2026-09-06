import { useState, useRef, KeyboardEvent } from 'react';

interface MessageComposerProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function MessageComposer({
  onSend,
  disabled = false,
}: MessageComposerProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (!message.trim() || disabled) return;
    onSend(message);
    setMessage('');
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

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Noop for now - file attachments not implemented
      console.log('File selected (not yet implemented):', files[0].name);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="compose-container">
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
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            className="compose-attach"
            title="Attach file"
            onClick={handleAttachClick}
          >
            📎
          </button>
          <button
            className="compose-send"
            onClick={handleSend}
            disabled={!message.trim() || disabled}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
