import { useState, useEffect, useRef, KeyboardEvent } from 'react';

interface SecretRequestCardProps {
  providerId: string;
  providerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SecretRequestCard({
  providerId,
  providerName,
  onClose,
  onSuccess,
}: SecretRequestCardProps) {
  const [secret, setSecret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!secret.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await window.electronAPI.setProviderSecret(providerId, 'apiKey', secret);
      if (result.ok) {
        setSecret('');
        onSuccess();
        setTimeout(onClose, 300);
      } else {
        setError(result.error || 'Failed to save key');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isSubmitting) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="secret-card-overlay" onClick={onClose}>
      <div className="secret-card" onClick={(e) => e.stopPropagation()}>
        <div className="secret-card-header">
          <span className="secret-card-label">{providerName} API key</span>
        </div>
        
        <input
          ref={inputRef}
          type="password"
          className="secret-card-input"
          placeholder="Enter your API key"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
          autoComplete="off"
        />
        
        {error && (
          <div className="secret-card-error">{error}</div>
        )}
        
        <div className="secret-card-actions">
          <button
            className="secret-card-cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="secret-card-confirm"
            onClick={handleSubmit}
            disabled={!secret.trim() || isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
