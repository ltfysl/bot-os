import { useState, KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import type { WidgetRequest, WidgetResponse } from '../types';

interface WidgetCardProps {
  request: WidgetRequest;
  onResolve: (response: { selected: string[]; customValue?: string; dismissed: boolean }) => void;
}

export default function WidgetCard({ request, onResolve }: WidgetCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customValue, setCustomValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isResolved, setIsResolved] = useState(false);

  const { type, title, options } = request;

  const handleOptionClick = async (optionId: string) => {
    if (isSubmitting || isResolved) return;

    if (type === 'single-select' || type === 'danger') {
      const newSelected = new Set([optionId]);
      setSelected(newSelected);
      
      setIsSubmitting(true);
      setError(null);

      const response: WidgetResponse = {
        widgetId: request.id,
        selected: [optionId],
        dismissed: false,
      };

      try {
        await window.electronAPI.respondToWidget(response);
        setIsResolved(true);
        onResolve({ selected: [optionId], dismissed: false });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to submit response');
        setIsSubmitting(false);
      }
    } else if (type === 'multi-select' || type === 'allow-custom') {
      const newSelected = new Set(selected);
      if (newSelected.has(optionId)) {
        newSelected.delete(optionId);
      } else {
        newSelected.add(optionId);
      }
      setSelected(newSelected);
    }
  };

  const handleConfirm = async () => {
    if (isSubmitting || isResolved) return;
    
    if (selected.size === 0 && !customValue.trim()) {
      setError('Please select an option or enter a custom value');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response: WidgetResponse = {
      widgetId: request.id,
      selected: Array.from(selected),
      customValue: customValue.trim() || undefined,
      dismissed: false,
    };

    try {
      await window.electronAPI.respondToWidget(response);
      setIsResolved(true);
      onResolve({
        selected: Array.from(selected),
        customValue: customValue.trim() || undefined,
        dismissed: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response');
      setIsSubmitting(false);
    }
  };

  const handleDismiss = () => {
    if (isSubmitting || isResolved) return;

    onResolve({ selected: [], dismissed: true });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isSubmitting) {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleDismiss();
    }
  };

  const renderOptions = () => {
    const isChipLayout = options.length <= 4 && options.every(opt => opt.label.length <= 20);

    if (isChipLayout) {
      return (
        <div className="widget-options-chips">
          {options.map((option) => (
            <button
              key={option.id}
              className={`widget-chip ${selected.has(option.id) ? 'selected' : ''} ${
                type === 'danger' ? 'danger' : ''
              }`}
              onClick={() => handleOptionClick(option.id)}
              disabled={isSubmitting || isResolved}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className="widget-options-rows">
        {options.map((option) => (
          <button
            key={option.id}
            className={`widget-option-row ${selected.has(option.id) ? 'selected' : ''} ${
              type === 'danger' ? 'danger' : ''
            }`}
            onClick={() => handleOptionClick(option.id)}
            disabled={isSubmitting || isResolved}
          >
            <span className="widget-option-label">{option.label}</span>
            {selected.has(option.id) && (
              <Check size={14} strokeWidth={2} className="widget-option-check" />
            )}
          </button>
        ))}
      </div>
    );
  };

  if (isResolved) {
    return null;
  }

  return (
    <div className="widget-card">
      {title && <div className="widget-title">{title}</div>}
      
      {renderOptions()}

      {type === 'allow-custom' && (
        <input
          type="text"
          className="widget-custom-input"
          placeholder="Or enter custom value..."
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting || isResolved}
        />
      )}

      {error && <div className="widget-error">{error}</div>}

      <div className="widget-actions">
        <button
          className="widget-dismiss"
          onClick={handleDismiss}
          disabled={isSubmitting || isResolved}
        >
          Dismiss
        </button>
        {(type === 'multi-select' || type === 'allow-custom') && (
          <button
            className="widget-confirm"
            onClick={handleConfirm}
            disabled={(selected.size === 0 && !customValue.trim()) || isSubmitting || isResolved}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm'}
          </button>
        )}
      </div>
    </div>
  );
}
