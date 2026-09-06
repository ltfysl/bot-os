# Routines Usage Guide

## Overview

BotOS now supports scheduled routines that can fire automatically based on cron schedules or simple weekday times. Routines execute prompts through the AgentBus to your configured agents.

## Creating a Routine

### From Renderer (DevTools Console)

```javascript
// Create a weekday morning reminder
await window.electronAPI.createRoutine({
  name: 'Morning Standup',
  prompt: 'Generate a brief summary of my pending tasks',
  schedule: 'Mon 09:00',
  enabled: true
});

// Create a routine using 5-field cron (every weekday at 2:30 PM)
await window.electronAPI.createRoutine({
  name: 'Afternoon Check-in',
  prompt: 'Review progress and suggest next steps',
  schedule: '30 14 * * 1-5',
  enabled: true
});

// Create a routine every hour
await window.electronAPI.createRoutine({
  name: 'Hourly Sync',
  prompt: 'Quick status check',
  schedule: '0 * * * *',
  enabled: true
});
```

## Schedule Formats

### Weekday Time Format
Simple format: `<weekday> HH:MM`

Supported weekdays: `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` (case-insensitive)

Examples:
- `"Mon 09:00"` - Every Monday at 9:00 AM
- `"Fri 17:00"` - Every Friday at 5:00 PM
- `"Wed 12:30"` - Every Wednesday at 12:30 PM

### 5-Field Cron Format
Format: `minute hour dayOfMonth month dayOfWeek`

Fields:
- `minute`: 0-59
- `hour`: 0-23
- `dayOfMonth`: 1-31
- `month`: 1-12
- `dayOfWeek`: 0-6 (0 = Sunday, 6 = Saturday)

Special characters:
- `*`: Any value
- `-`: Range (e.g., `1-5` for Monday-Friday)
- `,`: List (e.g., `1,3,5` for Mon, Wed, Fri)
- `/`: Step (e.g., `*/15` for every 15 minutes)

Examples:
- `"0 9 * * 1-5"` - Weekdays at 9:00 AM
- `"30 14 * * *"` - Every day at 2:30 PM
- `"0 */2 * * *"` - Every 2 hours
- `"0 0 1 * *"` - First day of every month at midnight
- `"15,45 * * * *"` - At 15 and 45 minutes past every hour

## Managing Routines

### List All Routines

```javascript
const routines = await window.electronAPI.listRoutines();
console.table(routines);
```

### Update a Routine

```javascript
// Change schedule
await window.electronAPI.updateRoutine('routine-id', {
  schedule: 'Tue 10:00'
});

// Change prompt
await window.electronAPI.updateRoutine('routine-id', {
  prompt: 'New prompt text here'
});

// Update multiple fields
await window.electronAPI.updateRoutine('routine-id', {
  name: 'Updated Name',
  schedule: '0 8 * * 1-5',
  enabled: false
});
```

### Pause/Resume a Routine

```javascript
// Pause
await window.electronAPI.setRoutineEnabled('routine-id', false);

// Resume
await window.electronAPI.setRoutineEnabled('routine-id', true);
```

### Delete a Routine

```javascript
const deleted = await window.electronAPI.deleteRoutine('routine-id');
console.log('Deleted:', deleted);
```

## How It Works

1. **Scheduler Loop**: Runs every 60 seconds in the main process
2. **Schedule Evaluation**: Matches current local time against each enabled routine's schedule
3. **Fire Mechanism**: When a schedule matches:
   - Invokes `agentBus.sendMessage(routine.prompt, targetAgentId, { routine: true })`
   - Uses the default provider's agent (or first available agent)
   - Response is processed normally through the provider
4. **State Tracking**:
   - `lastRun` timestamp updated after successful execution
   - Routines persisted to `userData/routines.json`
5. **Error Handling**: Failed routine executions are logged but don't stop the scheduler

## Testing a Routine Manually

```javascript
// Create a routine that fires in the next minute
const now = new Date();
const nextMinute = new Date(now.getTime() + 60000);
const schedule = `${nextMinute.getMinutes()} ${nextMinute.getHours()} * * *`;

await window.electronAPI.createRoutine({
  name: 'Test Routine',
  prompt: 'This is a test prompt',
  schedule: schedule,
  enabled: true
});

// Wait ~60 seconds and check the agent responses or console logs
```

## Architecture Notes

### Secret-Safe IPC
- All IPC calls use context isolation
- No provider secrets transmitted over IPC boundary
- Routine context `{ routine: true }` passed to AgentBus but NOT to provider HTTP bodies

### Provider Integration
- Routines use existing AgentBus architecture
- Fire path: `RoutineManager` → `AgentBus.sendMessage()` → `Provider.sendMessage()`
- MiniMax/Z.ai body leak fixes preserved (context not spread into request JSON)

### Persistence
- File: `app.getPath('userData')/routines.json`
- Format: JSON array of Routine objects
- Loaded on app start, saved on create/update/delete/fire

## Future Enhancements (Out of Scope)

- Full Grok Bot routines UI (owned by Nyx/Vale)
- GitHub/Slack event triggers
- Skills library integration
- Secret-request cards for routine creation
