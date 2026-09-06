# BotOS

A premium desktop multi-agent application inspired by Grok Bot, built with Electron, React, and TypeScript.

## Features (Current Slice)

- 🎨 **Premium Dark Theme UI** - Warm, dense chat interface with polished typography and spacing
- 💬 **Real-time Chat Interface** - Message composer with auto-expanding textarea and smooth animations
- 🤖 **Agent Sidebar** - Live agent presence indicators showing status (active/idle/offline), collapses to icons at tight widths
- 📎 **Attachment Controls** - File picker wired to attach button (noop implementation for future attachment support)
- 📂 **Channel Switcher** - Navigate between different conversation channels
- 🔌 **Extensible Architecture** - Clean module seams for future agent bus and provider plugins
- 💬 **Code Recognition** - Inline backtick code/paths (`` `config.ts` ``) parsed into styled `<code>` elements
- 🎨 **Consistent Surface Design** - Message bubbles use `--bg-message` soft surface (#181818)

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
│   │   ├── main.ts        # App entry, window management, IPC handlers
│   │   ├── preload.ts     # IPC bridge (secure context isolation)
│   │   ├── agent-bus.ts   # Agent-provider coordination bus
│   │   ├── secrets.ts     # Provider secret management (main-only)
│   │   └── providers/     # AI provider implementations
│   │       ├── mock-providers.ts
│   │       └── minimax-provider.ts
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

The `AgentBus` class provides coordination between agents and pluggable AI providers. Each agent maps to a provider for message routing.

```typescript
interface AgentProvider {
  id: string;
  name: string;
  sendMessage(message: string, context?: Record<string, unknown>): Promise<string>;
  isAvailable(): Promise<boolean>;
}
```

**Current Providers:**
- `MockEchoProvider` - Short-beat acknowledgments
- `MockIntelligentProvider` - Simulates realistic AI responses with varied lengths
- `MiniMaxProvider` - Real third-party API integration (see Configuration below)
- `ZaiProvider` - Z.ai GLM-5.3 model via OpenAI-compatible endpoint (unavailable without credentials)
- `CodingPlanProvider` - OpenAI-compatible coding assistance endpoint (unavailable without credentials)

**Provider Pluggability:**
- Providers register at startup via `AgentBus` constructor
- Each agent binds to a specific provider via `providerId`
- Messages route through `sendMessage(message, agentId)` to agent's provider
- Provider secrets stay in main process only (env vars or `safeStorage`)
- Renderer sees only `{ providerId, hasSecret, isAvailable }` status

**Future Providers:**
- OpenAI, Anthropic, local models (Ollama, LM Studio)
- Custom provider plugins following the `AgentProvider` interface

### Provider Configuration

#### MiniMax Provider
To enable the MiniMax provider, set your API key via environment variable:

```bash
export MINIMAX_APIKEY=your_api_key_here
npm start
```

The provider will automatically become available when a valid key is present. Without a key, it remains listed but shows as unavailable.

**Get your API key:** Visit [MiniMax Platform](https://platform.minimax.io/) to create an account and generate an API key.

#### Z.ai Provider
To enable the Z.ai provider, set your API key via environment variable:

```bash
export ZAI_APIKEY=your_api_key_here
npm start
```

The provider will automatically become available when a valid key is present. Without a key, it remains listed but shows as unavailable.

#### Coding Plan Provider
To enable the Coding Plan provider, set your API key via environment variable:

```bash
export CODING_PLAN_APIKEY=your_api_key_here
npm start
```

Optionally configure the base URL for custom OpenAI-compatible endpoints:

```bash
export CODING_PLAN_BASE_URL=https://api.example.com/v1/chat/completions
export CODING_PLAN_APIKEY=your_api_key_here
npm start
```

The provider defaults to OpenAI's API endpoint. Without a key, it remains listed but shows as unavailable.

### IPC Communication

Secure IPC via `contextBridge` in preload script:

```typescript
window.electronAPI = {
  sendMessage: (agentId: string, message: string) => Promise<Message>,
  getChannels: () => Promise<Channel[]>,
  getAgents: () => Promise<Agent[]>,
  listProviders: () => Promise<ProviderInfo[]>,
  setDefaultProvider: (providerId: string) => Promise<{ success: boolean }>,
  getDefaultProvider: () => Promise<string | undefined>,
  updateAgentProvider: (agentId: string, providerId: string) => Promise<{ success: boolean }>,
}
```

**Key Changes:**
- `sendMessage` now requires `agentId` to route to correct provider
- Provider list/switch methods expose provider status without secrets
- Agent-provider bindings updated via `updateAgentProvider`

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
