# Routines Verification

## Feature Overview

Routines are scheduled recurring tasks that fire prompts to agents at specified times. The RoutinesView provides CRUD UI, and RoutineManager handles scheduling and persistence.

## Critical Paths

### Path 1: Open Routines View

**When to verify:** Changes to Sidebar navigation or RoutinesView component

**Steps:**
1. Launch app
2. Click "Routines" button in sidebar
3. Verify RoutinesView overlays main content
4. Check header shows "Routines" title and ✕ close button

**Expected behavior:**
- Routines view replaces agent/room view
- Header shows title and close button
- Empty state or routine list displays
- No layout shift or flickering

**Evidence:**
- Screenshot: `routines-open.png`

### Path 2: Create Routine

**When to verify:** Changes to routine creation, RoutineManager validation, or persistence

**Steps:**
1. Open Routines view
2. Click "Create routine" or "+ New routine"
3. Fill in form:
   - Name: "Daily standup"
   - Schedule: "Mon 09:00"
   - Prompt: "Summarize my tasks for today"
4. Click "Create"
5. Verify new routine appears in list
6. Close and reopen Routines view
7. Verify routine persisted

**Expected behavior:**
- Create button opens form sheet
- Form validates required fields (disables Create button if empty)
- Routine saved to `userData/routines.json`
- Routine appears immediately after creation
- Routine persists across app restarts

**Evidence:**
- Screenshot: `routine-create-form.png`
- Screenshot: `routine-created.png`

### Path 3: Schedule Format Validation

**When to verify:** Changes to schedule validation logic

**Test cases:**

1. **Weekday time format**: "Mon 09:00" ✅
2. **5-field cron**: "0 9 * * 1" ✅
3. **Cron range**: "0 9-17 * * 1-5" ✅
4. **Cron step**: "*/15 * * * *" ✅
5. **Invalid format**: "9am Monday" ❌

**Steps:**
1. Open create form
2. Enter each schedule format
3. Click Create
4. Verify valid formats succeed, invalid formats show error

**Expected behavior:**
- Valid formats: Routine created, no errors
- Invalid formats: Error message displayed, routine not created
- Error message clear: "Invalid schedule format. Use 5-field cron or weekday time"

**Evidence:**
- Screenshot: `routine-schedule-valid.png`
- Screenshot: `routine-schedule-invalid.png`

### Path 4: Enable/Disable Routine

**When to verify:** Changes to routine toggle, enabled state management

**Steps:**
1. Create a routine (default: enabled)
2. Verify toggle is ON (green)
3. Click toggle to disable
4. Verify toggle switches to OFF (gray)
5. Verify routine state saved immediately
6. Restart app
7. Verify toggle state persisted

**Expected behavior:**
- Toggle switch animates smoothly
- Enabled state updates immediately
- Disabled routines don't fire (scheduler ignores them)
- State persists across restarts

**Evidence:**
- Screenshot: `routine-toggle-on.png`
- Screenshot: `routine-toggle-off.png`

### Path 5: Delete Routine

**When to verify:** Changes to routine deletion or list management

**Steps:**
1. Create a routine
2. Click overflow menu (⋯) on routine row
3. Confirm deletion
4. Verify routine removed from list
5. Restart app
6. Verify routine does not reappear

**Expected behavior:**
- Confirmation dialog appears
- Routine removed immediately on confirm
- Deletion persisted to file
- No orphaned data

**Evidence:**
- Screenshot: `routine-delete-confirm.png`
- Screenshot: `routine-deleted.png`

### Path 6: Schedule Display

**When to verify:** Changes to `formatSchedule` helper or schedule rendering

**Steps:**
1. Create routines with different schedule formats:
   - "Mon 09:00" → displays "Mon 09:00"
   - "0 9 * * 1" → displays "Mon 09:00"
   - "30 14 * * 5" → displays "Fri 14:30"
2. Verify each displays in human-readable format

**Expected behavior:**
- Weekday time formats pass through unchanged
- 5-field cron converted to "Day HH:MM"
- Complex cron (ranges, steps) shows raw format

**Evidence:**
- Screenshot: `routine-schedule-display.png`

### Path 7: Empty State

**When to verify:** Changes to empty state rendering or initial load

**Steps:**
1. Delete all routines (or start with fresh userData)
2. Open Routines view
3. Verify empty state displays

**Expected behavior:**
- Empty state message: "No routines yet"
- "Create routine" button visible
- No crashes or layout issues

**Evidence:**
- Screenshot: `routines-empty.png`

### Path 8: Scheduler Firing (Optional)

**When to verify:** Changes to scheduler logic, cron matching, or fire callback

**Steps (requires patience or time manipulation):**
1. Create a routine scheduled for 1 minute in the future
2. Wait for routine to fire
3. Check console logs for fire event
4. Verify `lastRun` timestamp updated

**Expected behavior:**
- Routine fires within 5 seconds of scheduled time
- Console log: "Firing routine: [name]"
- `lastRun` field updated in routine object
- Routine doesn't fire again in same minute

**Evidence:**
- Console: `routine-fire-log.txt`

## Edge Cases to Test

- **Invalid schedule**: Try creating routine with gibberish schedule
- **Duplicate names**: Create two routines with same name (should both exist independently)
- **Long prompt**: 500+ character prompt
- **Special chars**: Routine name with emojis or symbols

## Regression Checks

If you've changed code outside routines but want to verify routines still work:

- [ ] Open Routines view
- [ ] Create one routine
- [ ] Toggle it off and on
- [ ] Delete it
- [ ] Close Routines view
- [ ] Check console for errors

## Related Components

- `src/renderer/components/RoutinesView.tsx`
- `src/main/routines.ts` (RoutineManager)
- `src/main/preload.ts` (IPC: `listRoutines`, `createRoutine`, `setRoutineEnabled`, `deleteRoutine`)

## IPC Calls Used

- `window.electronAPI.listRoutines()` → `Promise<Routine[]>`
- `window.electronAPI.createRoutine(input: RoutineCreateInput)` → `Promise<Routine>`
- `window.electronAPI.setRoutineEnabled(id, enabled)` → `Promise<Routine>`
- `window.electronAPI.deleteRoutine(id)` → `Promise<boolean>`

## Routine Structure

```typescript
interface Routine {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  lastRun?: number;
}
```

**Key fields:**
- `schedule` - Supports "Mon 09:00" or 5-field cron format
- `enabled` - Scheduler only fires enabled routines
- `lastRun` - Unix timestamp of last fire (prevents double-fire in same minute)

## Persistence

- File: `userData/routines.json`
- Format: Array of `Routine` objects
- Saves on every CRUD operation
