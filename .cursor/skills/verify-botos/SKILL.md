---
skill: verify-botos
description: End-to-end verification workflow for BotOS features before PR merge
---

# BotOS Verification Skill

This skill provides a systematic verification workflow for BotOS changes. It ensures that UI and runtime features work correctly before code is merged to main.

## When to Use

Use this skill when:
- Making changes to UI components (chat, rooms, routines, secrets)
- Modifying agent-bus or provider logic
- Adding new features or fixing bugs that affect runtime behavior
- Before marking a PR ready for review

**Note:** This project has no GitHub Actions CI. This skill is the gate.

## Verification Workflow

### 1. Pre-flight Check

Before starting verification:
- Ensure you're on a clean working tree
- All code changes are committed
- Dependencies are up to date

### 2. Launch Sequence

Run these commands in order:

```bash
npm install
npm run type-check
npm start
```

**Expected outcomes:**
- `npm install` completes without errors
- `npm run type-check` reports no TypeScript errors
- `npm start` launches the Electron app with DevTools open
- App window appears at 1400x900 with dark theme

### 3. Feature Verification

Based on what files you've changed, consult the appropriate feature map:

- **chat-shell.md** - Message sending, composer behavior, agent switching
- **agent-rail.md** - Provider switching, secret management, agent-provider bindings
- **rooms.md** - Room creation, multi-agent coordination, @-mentions
- **routines.md** - Routine CRUD, scheduling, enable/disable
- **secrets.md** - API key entry, provider availability updates

Each feature map contains:
- **Critical paths** - Must-verify flows for that feature
- **Test steps** - Specific actions to perform
- **Expected behavior** - What should happen at each step
- **Evidence capture** - Screenshots or logs to save

### 4. Evidence Collection

Store all verification evidence in `artifacts/verify-botos/`:

```
artifacts/verify-botos/
├── screenshots/
│   ├── 01-launch.png
│   ├── 02-chat-send.png
│   ├── 03-provider-switch.png
│   └── ...
├── console-logs.txt
└── verification-summary.md
```

**Required evidence:**
- Screenshots of each critical path
- Console output showing no errors
- Summary document listing what was verified

### 5. Doctor Check

Before finalizing, run a quick "doctor" check:

1. Open DevTools Console (Cmd/Ctrl + Shift + I)
2. Check for any red errors or warnings
3. Verify no network failures in Network tab
4. Confirm all IPC calls succeed

### 6. Completion Checklist

- [ ] App launches without errors
- [ ] Type check passes
- [ ] All relevant features verified per feature maps
- [ ] Screenshots captured in `artifacts/verify-botos/`
- [ ] Console shows no critical errors
- [ ] `verification-summary.md` completed

## Integration with PR Workflow

When opening a PR that touches UI or runtime code:

1. Run this skill's complete verification workflow
2. Commit evidence to `artifacts/verify-botos/`
3. Link to evidence directory in PR description:

```markdown
## Verification

Verified using `.cursor/skills/verify-botos`:
- [x] Launch sequence
- [x] Chat shell
- [x] Provider switching
- Evidence: `artifacts/verify-botos/`
```

## Feature Maps

Detailed verification steps for each feature area:

- [chat-shell.md](./features/chat-shell.md)
- [agent-rail.md](./features/agent-rail.md)
- [rooms.md](./features/rooms.md)
- [routines.md](./features/routines.md)
- [secrets.md](./features/secrets.md)

## Tips

- **Start fresh**: Close and restart the app between major feature checks
- **Check logs**: Always inspect console output for hidden issues
- **Test edge cases**: Empty states, long messages, rapid input
- **Provider fallback**: Verify behavior when providers are unavailable
- **Persistence**: Verify data persists across app restarts where expected

## Troubleshooting

### App won't launch
- Check `npm run type-check` output
- Verify all dependencies installed
- Look for port conflicts (5173 already in use)

### Type errors after changes
- Run `npm run build` to catch build-time issues
- Check imports and type definitions

### Runtime errors
- Open DevTools immediately on launch
- Check main process logs (terminal output)
- Verify IPC bridge is working

## Architecture Notes

BotOS uses a two-process architecture:
- **Main process** (Node.js) - Agent bus, providers, secrets, persistence
- **Renderer process** (Chromium) - React UI

Key IPC boundaries:
- `sendMessage` - Route user messages through agent bus
- `updateAgentProvider` - Change agent-provider bindings
- `setProviderSecret` - Store provider API keys
- `sendRoomMessage` - Multi-agent coordination
- `createRoutine` - Schedule recurring tasks

Feature maps follow these IPC boundaries when defining test paths.
