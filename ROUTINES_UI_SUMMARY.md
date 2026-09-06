# Routines UI Implementation Summary

## ✅ Requirements Met

### Core Goals
- [x] Desktop chrome for routines (NOT a settings dashboard)
- [x] Dense list like Grok Bot
- [x] Wire to existing secret-safe IPC from RoutineManager/preload
- [x] No new secret channels, no secrets in renderer

### UI Constraints (Nyx bar)
- [x] Dense list rows: name, schedule summary, enabled/paused state, quiet actions
- [x] Warm dense chat app feel: tight rhythm, soft surfaces, narrow chrome
- [x] NOT a SaaS settings page: no fat forms, no card grids, no dashboard padding
- [x] Shell chat intact (sidebar + chat)
- [x] Routines panel reachable without destroying chat density
- [x] Composer/chat patterns stay honest

### Bonus Feature
- [x] Surface send failures in ChatView UI (not just console.error)

## Implementation Details

### Files Created
- `src/renderer/components/RoutinesView.tsx` - Main routines list component

### Files Modified
- `src/renderer/App.tsx` - Added view mode switching (chat/routines)
- `src/renderer/components/Sidebar.tsx` - Added routines footer button
- `src/renderer/components/ChatView.tsx` - Surface send failures in UI
- `src/renderer/components/MessageList.tsx` - Error message styling
- `src/renderer/index.css` - Dense list styles, routines UI, error styles

### IPC Usage (Secret-Safe)
Uses existing IPC channels from preload.ts:
- `window.electronAPI.listRoutines()` - Load routines
- `window.electronAPI.setRoutineEnabled(id, enabled)` - Enable/pause
- `window.electronAPI.deleteRoutine(id)` - Delete
- **No new IPC channels created**
- **No secrets in renderer**

### UI Design Decisions

#### Dense Grok Bot List Style
- 52px row height (dense, not dashboard-style)
- Tight 8px padding between list and container edges
- Actions appear on hover (enable/pause/delete)
- Minimal visual weight (no cards, no fat borders)

#### Warm Chat App Feel
- Soft surfaces: `var(--bg-hover)` on hover
- Tight rhythm: 2px gap between name/meta
- Narrow chrome: 48px header matching chat header
- Smooth transitions: 0.1s ease

#### NOT a Settings Dashboard
- No card grids
- No fat forms
- No dashboard padding
- No section headers with heavy chrome
- Inline actions instead of separate edit modals

#### State Indicators
- Enabled: green `●` (matches agent status dots)
- Disabled: muted `○`
- Schedule: monospace font for technical clarity
- Last run: relative time ("2h ago", "Never")

#### Error Handling
- Error banner at top (red background, subtle border)
- Empty state (clock emoji, centered message)
- Inline error messages in chat (red border-left)

### CSS Architecture
- Reuses existing design tokens (`--bg-*`, `--text-*`, `--accent-*`)
- Consistent with chat message styling
- Dense list follows agent rail patterns
- Actions follow provider menu patterns

## Testing Notes
- Build passes TypeScript type checking
- No runtime errors in build output
- All existing IPC channels preserved
- No architectural changes to main process

## Future Enhancements (Out of Scope)
- Create/edit routine UI (future PR)
- Routine trigger history log
- Schedule validation UI hints
- Keyboard shortcuts for actions
