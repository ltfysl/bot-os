import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface Room {
  id: string;
  name: string;
  memberAgentIds: string[];
  unread?: number;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
}

export class RoomManager {
  private rooms: Map<string, Room>;
  private messages: Map<string, RoomMessage[]>;
  private roomsFilePath: string;
  private messagesFilePath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    const roomsDir = path.join(userDataPath, 'rooms');
    
    if (!fs.existsSync(roomsDir)) {
      fs.mkdirSync(roomsDir, { recursive: true });
    }

    this.roomsFilePath = path.join(roomsDir, 'rooms.json');
    this.messagesFilePath = path.join(roomsDir, 'messages.json');
    
    this.rooms = new Map();
    this.messages = new Map();
    
    this.loadRooms();
    this.loadMessages();
  }

  private loadRooms(): void {
    try {
      if (fs.existsSync(this.roomsFilePath)) {
        const data = fs.readFileSync(this.roomsFilePath, 'utf-8');
        const roomsArray: Room[] = JSON.parse(data);
        this.rooms = new Map(roomsArray.map((r) => [r.id, r]));
      }
    } catch (err) {
      console.error('Failed to load rooms:', err);
    }
  }

  private loadMessages(): void {
    try {
      if (fs.existsSync(this.messagesFilePath)) {
        const data = fs.readFileSync(this.messagesFilePath, 'utf-8');
        const messagesObj: Record<string, RoomMessage[]> = JSON.parse(data);
        this.messages = new Map(Object.entries(messagesObj));
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  private saveRooms(): void {
    try {
      const roomsArray = Array.from(this.rooms.values());
      fs.writeFileSync(this.roomsFilePath, JSON.stringify(roomsArray, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save rooms:', err);
    }
  }

  private saveMessages(): void {
    try {
      const messagesObj = Object.fromEntries(this.messages.entries());
      fs.writeFileSync(this.messagesFilePath, JSON.stringify(messagesObj, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save messages:', err);
    }
  }

  listRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  createRoom(name: string, memberAgentIds: string[]): Room {
    const room: Room = {
      id: Date.now().toString(),
      name,
      memberAgentIds,
      unread: 0,
    };
    
    this.rooms.set(room.id, room);
    this.messages.set(room.id, []);
    this.saveRooms();
    this.saveMessages();
    
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  updateRoom(roomId: string, updates: Partial<Omit<Room, 'id'>>): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const updated = { ...room, ...updates };
    this.rooms.set(roomId, updated);
    this.saveRooms();
    
    return updated;
  }

  deleteRoom(roomId: string): boolean {
    const deleted = this.rooms.delete(roomId);
    if (deleted) {
      this.messages.delete(roomId);
      this.saveRooms();
      this.saveMessages();
    }
    return deleted;
  }

  getRoomMessages(roomId: string): RoomMessage[] {
    return this.messages.get(roomId) || [];
  }

  addRoomMessage(message: RoomMessage): void {
    const roomMessages = this.messages.get(message.roomId) || [];
    roomMessages.push(message);
    this.messages.set(message.roomId, roomMessages);
    this.saveMessages();
  }

  clearUnread(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.unread = 0;
      this.rooms.set(roomId, room);
      this.saveRooms();
    }
  }

  incrementUnread(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.unread = (room.unread || 0) + 1;
      this.rooms.set(roomId, room);
      this.saveRooms();
    }
  }
}
