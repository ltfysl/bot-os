# BotOS

A premium desktop multi-agent application inspired by Grok Bot, built with Electron, React, and TypeScript.

## Features (Current Slice)

- 🎨 **Premium Dark Theme UI** - Warm, dense chat interface with polished typography and spacing
- 💬 **Real-time Chat Interface** - Message composer with auto-expanding textarea and smooth animations
- 🤖 **Agent Sidebar** - Live agent presence indicators showing status (active/idle/offline)
- 📂 **Channel Switcher** - Navigate between different conversation channels
- 🔌 **Extensible Architecture** - Clean module seams for future agent bus and provider plugins

## Tech Stack

### Framework: Electron
**Why Electron over Tauri:**
- Proven track record with chat apps (Discord, Slack, VS Code)
- Excellent React/TypeScript integration with hot reload
- Mature IPC patterns perfect for agent orchestration
- Rich ecosystem for third-party AI provider integrations
- Superior debugging and development experience

### Core Technologies
- **Electron 28** - Desktop framework
- **React 18** - UI library with hooks
- **TypeScript 5** - Type safety
- **Vite 5** - Fast build tool and dev server

## Getting Started

### Prerequisites
- Node.js 18+ (20+ recommended)
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# or with pnpm
pnpm install
```

### Development

```bash
# Start the development server
npm start
```

This command:
1. Builds the main process (TypeScript → JavaScript)
2. Starts Vite dev server on port 5173
3. Launches Electron in development mode with hot reload
4. Opens DevTools automatically

### Production Build

```bash
# Build both main and renderer processes
npm run build

# Run the production build
npm run electron:prod
```

## Architecture

### Directory Structure

```
bot-os/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.ts        # App entry, window management
│   │   ├── preload.ts     # IPC bridge (secure context isolation)
│   │   ├── agent-bus.ts   # Agent provider abstraction
│   │   └── providers/     # AI provider implementations
│   │       └── mock-providers.ts
│   └── renderer/          # React UI
│       ├── main.tsx       # React entry
│       ├── App.tsx        # Root component
│       ├── index.css      # Global styles
│       ├── types.ts       # TypeScript definitions
│       └── components/    # UI components
│           ├── Sidebar.tsx
│           ├── ChatView.tsx
│           ├── MessageList.tsx
│           ├── MessageComposer.tsx
│           └── AgentsSidebar.tsx
├── dist/                  # Build output
├── package.json
├── tsconfig.json          # Renderer TS config
├── tsconfig.main.json     # Main process TS config
└── vite.config.ts         # Vite configuration
```

### Process Architecture

```
┌─────────────────────────────────────────┐
│           Main Process (Node)           │
│  ┌────────────────────────────────────┐ │
│  │         Agent Bus                  │ │
│  │  - Provider Registry               │ │
│  │  - Message Routing                 │ │
│  │  - Context Management              │ │
│  └────────────────────────────────────┘ │
│              ↕ IPC                      │
│  ┌────────────────────────────────────┐ │
│  │        Preload Bridge              │ │
│  │  (Context Isolation)               │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                  ↕
┌─────────────────────────────────────────┐
│      Renderer Process (Chromium)        │
│  ┌────────────────────────────────────┐ │
│  │           React App                │ │
│  │  - Chat UI                         │ │
│  │  - Agent Sidebar                   │ │
│  │  - Channel Navigation              │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Agent Bus Design

The `AgentBus` class provides a clean abstraction for future AI provider integrations:

```typescript
interface AgentProvider {
  id: string;
  name: string;
  sendMessage(message: string, context?: Record<string, unknown>): Promise<string>;
  isAvailable(): Promise<boolean>;
}
```

**Current Providers:**
- `MockEchoProvider` - Simple echo for testing
- `MockIntelligentProvider` - Simulates realistic AI responses with delays

**Future Providers (Planned):**
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Local models (Ollama, LM Studio)
- Custom provider plugins

### IPC Communication

Secure IPC via `contextBridge` in preload script:

```typescript
window.electronAPI = {
  sendMessage: (message: string) => Promise<Message>,
  getChannels: () => Promise<Channel[]>,
  getAgents: () => Promise<Agent[]>,
}
```

## UI Design Philosophy

### Visual Principles
- **Dense, not cluttered** - Information-rich without overwhelming
- **Warm dark theme** - Easy on eyes for extended sessions
- **Premium feel** - Polished animations, smooth transitions
- **Grok Bot spirit** - Professional, approachable, functional

### Color System
- Background: `#0a0a0a` (primary) → `#1a1a1a` (tertiary)
- Text: `#e8e8e8` (primary) → `#505050` (muted)
- Accent: Indigo gradient (`#6366f1` → `#8b5cf6`)
- Status indicators: Green (active), Amber (idle), Gray (offline)

### Typography
- System font stack for native feel
- 14px base for chat, 13px for UI chrome
- -0.02em letter-spacing for titles (tight, modern)

## Testing

### Manual Test Plan

1. **App Launch**
   - [ ] Window opens at 1400x900
   - [ ] Dark theme renders correctly
   - [ ] No console errors

2. **Channel Navigation**
   - [ ] Click each channel in sidebar
   - [ ] Channel name updates in header
   - [ ] Message count resets to 0

3. **Message Flow**
   - [ ] Type message and press Enter
   - [ ] User message appears immediately
   - [ ] Assistant response appears after delay
   - [ ] "Thinking..." indicator shows during wait
   - [ ] Auto-scroll to latest message

4. **Composer Behavior**
   - [ ] Textarea expands with content
   - [ ] Shift+Enter adds new line
   - [ ] Enter sends message
   - [ ] Send button disables when empty
   - [ ] Textarea resets after send

5. **Agent Sidebar**
   - [ ] Three agents display
   - [ ] Status indicators show correct colors
   - [ ] Agent avatars render

6. **Visual Polish**
   - [ ] Smooth animations on message appear
   - [ ] Hover states on clickable elements
   - [ ] Consistent spacing throughout
   - [ ] Scrollbars styled correctly

## Roadmap

### Phase 1: Shell (Current) ✅
- [x] Basic Electron + React setup
- [x] Chat transcript UI
- [x] Agent sidebar presence
- [x] Channel switcher stub
- [x] Mock assistant responses
- [x] Agent bus architecture

### Phase 2: Real Providers
- [ ] OpenAI integration
- [ ] Anthropic integration
- [ ] Provider settings UI
- [ ] API key management (secure storage)

### Phase 3: Advanced Features
- [ ] Routines system
- [ ] Skills library
- [ ] Multi-agent coordination
- [ ] Secrets UX
- [ ] Provider plugin system

### Phase 4: Polish & Extend
- [ ] Custom themes
- [ ] Keyboard shortcuts
- [ ] Search & filters
- [ ] Export conversations
- [ ] Auto-updates

## Contributing

This is the first slice of BotOS. Future contributions should:
- Follow the established architecture patterns
- Implement new providers via `AgentProvider` interface
- Keep UI components modular and reusable
- Maintain the premium visual feel

## License

MIT
