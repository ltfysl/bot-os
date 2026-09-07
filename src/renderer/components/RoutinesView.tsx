import { useState, useEffect } from 'react';
import { X, MoreVertical } from 'lucide-react';
import type { Routine, RoutineCreateInput } from '../types';

interface RoutinesViewProps {
  onClose: () => void;
}

export default function RoutinesView({ onClose }: RoutinesViewProps) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<RoutineCreateInput>({
    name: '',
    prompt: '',
    schedule: '',
    enabled: true,
  });
  const [creating, setCreating] = useState(false);

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
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await window.electronAPI.deleteRoutine(id);
      await loadRoutines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete routine');
    }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.prompt.trim() || !createForm.schedule.trim()) {
      setError('Name, schedule, and prompt are required');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      await window.electronAPI.createRoutine(createForm);
      setShowCreate(false);
      setCreateForm({ name: '', prompt: '', schedule: '', enabled: true });
      await loadRoutines();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create routine');
    } finally {
      setCreating(false);
    }
  };

  const formatSchedule = (schedule: string): string => {
    // If already human-readable (e.g., "Mon 09:00"), return as-is
    const weekdayPattern = /^(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}):(\d{2})$/i;
    const match = schedule.match(weekdayPattern);
    if (match) {
      const day = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      return `${day} ${match[2]}:${match[3]}`;
    }

    // Try to parse cron format: minute hour * * day-of-week
    const cronPattern = /^(\d+)\s+(\d+)\s+\*\s+\*\s+(\d+)$/;
    const cronMatch = schedule.match(cronPattern);
    if (cronMatch) {
      const minute = cronMatch[1].padStart(2, '0');
      const hour = cronMatch[2].padStart(2, '0');
      const dayOfWeek = parseInt(cronMatch[3], 10);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      if (dayOfWeek >= 0 && dayOfWeek <= 6) {
        return `${days[dayOfWeek]} ${hour}:${minute}`;
      }
    }

    // Fallback to raw schedule
    return schedule;
  };

  if (loading) {
    return (
      <div className="main-content">
        <div className="routines-header">
          <span className="routines-title">Routines</span>
          <button className="routines-close" onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </button>
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
        <button className="routines-close" onClick={onClose}>
          <X size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="routines-container">
        {error && (
          <div className="routines-error">
            {error}
            <button onClick={() => setError(null)}>
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        )}
        {routines.length === 0 ? (
          <div className="routines-empty">
            <div className="empty-message">No routines yet</div>
            <button className="create-routine-btn" onClick={() => setShowCreate(true)}>
              Create routine
            </button>
          </div>
        ) : (
          <>
            <div className="routines-list">
              {routines.map((routine) => (
                <div key={routine.id} className="routine-row">
                  <div className="routine-main">
                    <div className="routine-name">{routine.name}</div>
                    <div className="routine-schedule">{formatSchedule(routine.schedule)}</div>
                  </div>
                  <div className="routine-controls">
                    <label className="routine-toggle">
                      <input
                        type="checkbox"
                        checked={routine.enabled}
                        onChange={() => handleToggleEnabled(routine.id, routine.enabled)}
                      />
                      <span className="toggle-slider" />
                    </label>
                    <button
                      className="routine-overflow"
                      onClick={() => handleDelete(routine.id, routine.name)}
                      title="Delete"
                    >
                      <MoreVertical size={16} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="routines-footer">
              <button className="create-routine-btn" onClick={() => setShowCreate(true)}>
                + New routine
              </button>
            </div>
          </>
        )}
      </div>
      {showCreate && (
        <div className="create-sheet-overlay" onClick={() => setShowCreate(false)}>
          <div className="create-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="create-sheet-header">
              <span className="create-sheet-title">New routine</span>
              <button className="create-sheet-close" onClick={() => setShowCreate(false)}>
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="create-sheet-body">
              <div className="create-field">
                <label className="create-label">Name</label>
                <input
                  type="text"
                  className="create-input"
                  placeholder="Morning standup"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="create-field">
                <label className="create-label">Schedule</label>
                <input
                  type="text"
                  className="create-input"
                  placeholder="Mon 09:00 or 0 9 * * 1"
                  value={createForm.schedule}
                  onChange={(e) => setCreateForm({ ...createForm, schedule: e.target.value })}
                />
              </div>
              <div className="create-field">
                <label className="create-label">Prompt</label>
                <textarea
                  className="create-input create-textarea"
                  placeholder="What should the routine do?"
                  value={createForm.prompt}
                  onChange={(e) => setCreateForm({ ...createForm, prompt: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <div className="create-sheet-footer">
              <button className="create-cancel" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="create-submit"
                onClick={handleCreate}
                disabled={creating || !createForm.name.trim() || !createForm.schedule.trim() || !createForm.prompt.trim()}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
