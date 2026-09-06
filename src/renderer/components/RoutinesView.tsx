import { useState, useEffect } from 'react';
import type { Routine } from '../types';

interface RoutinesViewProps {
  onClose: () => void;
}

export default function RoutinesView({ onClose }: RoutinesViewProps) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRoutines = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.listRoutines();
      setRoutines(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load routines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoutines();
  }, []);

  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      await window.electronAPI.setRoutineEnabled(id, !currentEnabled);
      await loadRoutines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update routine');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete routine "${name}"?`)) return;
    try {
      await window.electronAPI.deleteRoutine(id);
      await loadRoutines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete routine');
    }
  };

  const formatSchedule = (schedule: string): string => {
    const weekdayPattern = /^(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}):(\d{2})$/i;
    const match = schedule.match(weekdayPattern);
    if (match) {
      const day = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      return `${day} ${match[2]}:${match[3]}`;
    }
    return schedule;
  };

  const formatLastRun = (lastRun?: number): string => {
    if (!lastRun) return 'Never';
    const diff = Date.now() - lastRun;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="main-content">
        <div className="routines-header">
          <span className="routines-title">Routines</span>
          <button className="routines-close" onClick={onClose}>✕</button>
        </div>
        <div className="routines-container">
          <div className="routines-loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <div className="routines-header">
        <span className="routines-title">Routines</span>
        <button className="routines-close" onClick={onClose}>✕</button>
      </div>
      <div className="routines-container">
        {error && (
          <div className="routines-error">
            {error}
          </div>
        )}
        {routines.length === 0 ? (
          <div className="routines-empty">
            <div className="empty-icon">⏰</div>
            <div className="empty-title">No routines yet</div>
            <div className="empty-description">
              Scheduled routines will appear here
            </div>
          </div>
        ) : (
          <div className="routines-list">
            {routines.map((routine) => (
              <div key={routine.id} className="routine-row">
                <div className="routine-main">
                  <div className="routine-name">{routine.name}</div>
                  <div className="routine-meta">
                    <span className="routine-schedule">{formatSchedule(routine.schedule)}</span>
                    <span className="routine-separator">·</span>
                    <span className="routine-last-run">{formatLastRun(routine.lastRun)}</span>
                  </div>
                </div>
                <div className="routine-actions">
                  <button
                    className={`routine-action ${routine.enabled ? 'enabled' : 'disabled'}`}
                    onClick={() => handleToggleEnabled(routine.id, routine.enabled)}
                    title={routine.enabled ? 'Disable' : 'Enable'}
                  >
                    {routine.enabled ? '●' : '○'}
                  </button>
                  <button
                    className="routine-action delete"
                    onClick={() => handleDelete(routine.id, routine.name)}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
