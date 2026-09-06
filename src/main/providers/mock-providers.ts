import type { AgentProvider } from '../agent-bus';

export class MockEchoProvider implements AgentProvider {
  readonly id = 'mock-echo';
  readonly name = 'Mock Echo Provider';

  private shortBeats = ['Got it.', 'On it.', 'Done.', 'Sure.', 'Noted.'];

  async sendMessage(_message: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 600));
    return this.shortBeats[Math.floor(Math.random() * this.shortBeats.length)];
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export class MockIntelligentProvider implements AgentProvider {
  readonly id = 'mock-intelligent';
  readonly name = 'Mock Intelligent Provider';

  private shortResponses = [
    'Done',
    'On it',
    'Makes sense',
    'Got it',
    'Sure thing',
    'Let me check that',
    'Interesting approach',
    'That works',
    'Quick question first',
    'Almost there',
  ];

  private mediumResponses = [
    'Updated the `config.ts` file.\n\nAnything else?',
    'Checked the logs — no errors.\n\nLooks clean.',
    'Found three matches in `src/`.\n\nWhich one?',
    'Ran the tests. All passing.\n\nReady to deploy?',
    'That pattern appears in `utils/helpers.ts`.\n\nWant me to refactor it?',
    'Traced the issue to line 42.\n\nShould I fix it?',
    'Created the file at `src/components/Button.tsx`.\n\nCheck it out.',
    'Pushed to branch `feature/auth`.\n\nPR ready.',
    'Database migrated successfully.\n\nNo conflicts.',
    'Deployed to staging at `app.staging.dev`.\n\nTest away.',
  ];

  async sendMessage(message: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 800));
    
    const roll = Math.random();
    
    if (roll < 0.3) {
      return this.shortResponses[Math.floor(Math.random() * this.shortResponses.length)];
    } else {
      return this.mediumResponses[Math.floor(Math.random() * this.mediumResponses.length)];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
