import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface DirectMessage {
  id: string;
  participants: [string, string];
  createdAt: number;
}

export interface DmMessage {
  id: string;
  dmId: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
}

export class DmManager {
  private dms: Map<string, DirectMessage>;
  private messages: Map<string, DmMessage[]>;
  private dmsFilePath: string;
  private messagesFilePath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dmsDir = path.join(userDataPath, 'dms');
    
    if (!fs.existsSync(dmsDir)) {
      fs.mkdirSync(dmsDir, { recursive: true });
    }

    this.dmsFilePath = path.join(dmsDir, 'dms.json');
    this.messagesFilePath = path.join(dmsDir, 'messages.json');
    
    this.dms = new Map();
    this.messages = new Map();
    
    this.loadDms();
    this.loadMessages();
  }

  private loadDms(): void {
    try {
      if (fs.existsSync(this.dmsFilePath)) {
        const data = fs.readFileSync(this.dmsFilePath, 'utf-8');
        const dmsArray: DirectMessage[] = JSON.parse(data);
        this.dms = new Map(dmsArray.map((dm) => [dm.id, dm]));
      }
    } catch (err) {
      console.error('Failed to load DMs:', err);
    }
  }

  private loadMessages(): void {
    try {
      if (fs.existsSync(this.messagesFilePath)) {
        const data = fs.readFileSync(this.messagesFilePath, 'utf-8');
        const messagesObj: Record<string, DmMessage[]> = JSON.parse(data);
        this.messages = new Map(Object.entries(messagesObj));
      }
    } catch (err) {
      console.error('Failed to load DM messages:', err);
    }
  }

  private saveDms(): void {
    try {
      const dmsArray = Array.from(this.dms.values());
      fs.writeFileSync(this.dmsFilePath, JSON.stringify(dmsArray, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save DMs:', err);
    }
  }

  private saveMessages(): void {
    try {
      const messagesObj = Object.fromEntries(this.messages.entries());
      fs.writeFileSync(this.messagesFilePath, JSON.stringify(messagesObj, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save DM messages:', err);
    }
  }

  private makeDmId(agentId1: string, agentId2: string): string {
    const sorted = [agentId1, agentId2].sort();
    return `dm-${sorted[0]}-${sorted[1]}`;
  }

  getOrCreateDm(agentId1: string, agentId2: string): DirectMessage {
    if (agentId1 === agentId2) {
      throw new Error('Cannot create DM with self');
    }

    const dmId = this.makeDmId(agentId1, agentId2);
    let dm = this.dms.get(dmId);

    if (!dm) {
      const sorted = [agentId1, agentId2].sort() as [string, string];
      dm = {
        id: dmId,
        participants: sorted,
        createdAt: Date.now(),
      };
      this.dms.set(dmId, dm);
      this.messages.set(dmId, []);
      this.saveDms();
      this.saveMessages();
    }

    return dm;
  }

  getDm(agentId1: string, agentId2: string): DirectMessage | undefined {
    const dmId = this.makeDmId(agentId1, agentId2);
    return this.dms.get(dmId);
  }

  listDmsForAgent(agentId: string): DirectMessage[] {
    const result: DirectMessage[] = [];
    for (const dm of this.dms.values()) {
      if (dm.participants.includes(agentId)) {
        result.push(dm);
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  getDmMessages(dmId: string): DmMessage[] {
    return this.messages.get(dmId) || [];
  }

  addDmMessage(message: DmMessage): void {
    const dmMessages = this.messages.get(message.dmId) || [];
    dmMessages.push(message);
    this.messages.set(message.dmId, dmMessages);
    this.saveMessages();
  }

  getOtherParticipant(dmId: string, agentId: string): string | undefined {
    const dm = this.dms.get(dmId);
    if (!dm) return undefined;
    return dm.participants.find((id) => id !== agentId);
  }
}
