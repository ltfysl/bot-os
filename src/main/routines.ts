import { app } from 'electron';
import path from 'path';
import fs from 'fs';

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  lastRun?: number;
}

export interface RoutineCreateInput {
  name: string;
  prompt: string;
  schedule: string;
  enabled?: boolean;
}

export interface RoutineUpdateInput {
  name?: string;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
}

export type RoutineFireCallback = (routine: Routine) => Promise<void>;

export class RoutineManager {
  private routines: Map<string, Routine>;
  private schedulerInterval: NodeJS.Timeout | null;
  private fireCallback: RoutineFireCallback;
  private lastScheduleCheck: Map<string, Date>;

  constructor(fireCallback: RoutineFireCallback) {
    this.routines = new Map();
    this.schedulerInterval = null;
    this.fireCallback = fireCallback;
    this.lastScheduleCheck = new Map();
    this.loadRoutines();
  }

  private getRoutinesFilePath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'routines.json');
  }

  private loadRoutines(): void {
    try {
      const filePath = this.getRoutinesFilePath();
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const routinesArray: Routine[] = JSON.parse(data);
        this.routines = new Map(routinesArray.map((r) => [r.id, r]));
      }
    } catch (err) {
      console.error('Failed to load routines:', err);
    }
  }

  private saveRoutines(): void {
    try {
      const filePath = this.getRoutinesFilePath();
      const routinesArray = Array.from(this.routines.values());
      fs.writeFileSync(filePath, JSON.stringify(routinesArray, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save routines:', err);
      throw new Error('Failed to save routines');
    }
  }

  listRoutines(): Routine[] {
    return Array.from(this.routines.values());
  }

  getRoutine(id: string): Routine | undefined {
    return this.routines.get(id);
  }

  createRoutine(input: RoutineCreateInput): Routine {
    this.validateSchedule(input.schedule);
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const routine: Routine = {
      id,
      name: input.name,
      prompt: input.prompt,
      schedule: input.schedule,
      enabled: input.enabled !== false,
    };
    this.routines.set(id, routine);
    this.saveRoutines();
    return routine;
  }

  updateRoutine(id: string, input: RoutineUpdateInput): Routine {
    const routine = this.routines.get(id);
    if (!routine) {
      throw new Error(`Routine not found: ${id}`);
    }
    if (input.schedule !== undefined) {
      this.validateSchedule(input.schedule);
    }
    const updated: Routine = {
      ...routine,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.prompt !== undefined && { prompt: input.prompt }),
      ...(input.schedule !== undefined && { schedule: input.schedule }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    };
    this.routines.set(id, updated);
    this.saveRoutines();
    return updated;
  }

  setRoutineEnabled(id: string, enabled: boolean): Routine {
    return this.updateRoutine(id, { enabled });
  }

  deleteRoutine(id: string): boolean {
    const deleted = this.routines.delete(id);
    if (deleted) {
      this.lastScheduleCheck.delete(id);
      this.saveRoutines();
    }
    return deleted;
  }

  startScheduler(): void {
    if (this.schedulerInterval) {
      return;
    }
    this.schedulerInterval = setInterval(() => {
      this.checkSchedules();
    }, 60000);
    this.checkSchedules();
  }

  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  private checkSchedules(): void {
    const now = new Date();
    for (const routine of this.routines.values()) {
      if (!routine.enabled) {
        continue;
      }
      if (this.shouldFire(routine, now)) {
        this.fireRoutine(routine, now);
      }
    }
  }

  private shouldFire(routine: Routine, now: Date): boolean {
    const lastCheck = this.lastScheduleCheck.get(routine.id);
    if (lastCheck) {
      const minutesSinceLastCheck = (now.getTime() - lastCheck.getTime()) / 60000;
      if (minutesSinceLastCheck < 1) {
        return false;
      }
    }
    const matches = this.matchesSchedule(routine.schedule, now);
    this.lastScheduleCheck.set(routine.id, now);
    return matches;
  }

  private matchesSchedule(schedule: string, now: Date): boolean {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length === 5) {
      return this.matchesCron(parts, now);
    }
    const weekdayTimePattern = /^(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}):(\d{2})$/i;
    const match = schedule.match(weekdayTimePattern);
    if (match) {
      return this.matchesWeekdayTime(match[1], parseInt(match[2], 10), parseInt(match[3], 10), now);
    }
    throw new Error(`Invalid schedule format: ${schedule}`);
  }

  private matchesCron(parts: string[], now: Date): boolean {
    const minute = now.getMinutes();
    const hour = now.getHours();
    const dayOfMonth = now.getDate();
    const month = now.getMonth() + 1;
    const dayOfWeek = now.getDay();
    return (
      this.matchesCronField(parts[0], minute, 0, 59) &&
      this.matchesCronField(parts[1], hour, 0, 23) &&
      this.matchesCronField(parts[2], dayOfMonth, 1, 31) &&
      this.matchesCronField(parts[3], month, 1, 12) &&
      this.matchesCronField(parts[4], dayOfWeek, 0, 6)
    );
  }

  private matchesCronField(field: string, value: number, min: number, max: number): boolean {
    if (field === '*') {
      return true;
    }
    if (field.includes('/')) {
      const [range, step] = field.split('/');
      const stepValue = parseInt(step, 10);
      if (range === '*') {
        return value % stepValue === 0;
      }
      const [start] = range.split('-').map((n) => parseInt(n, 10));
      return value >= start && (value - start) % stepValue === 0;
    }
    if (field.includes('-')) {
      const [start, end] = field.split('-').map((n) => parseInt(n, 10));
      return value >= start && value <= end;
    }
    if (field.includes(',')) {
      const values = field.split(',').map((n) => parseInt(n, 10));
      return values.includes(value);
    }
    return parseInt(field, 10) === value;
  }

  private matchesWeekdayTime(
    weekday: string,
    hour: number,
    minute: number,
    now: Date
  ): boolean {
    const weekdayMap: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    const expectedDay = weekdayMap[weekday.toLowerCase()];
    return now.getDay() === expectedDay && now.getHours() === hour && now.getMinutes() === minute;
  }

  private async fireRoutine(routine: Routine, now: Date): Promise<void> {
    try {
      await this.fireCallback(routine);
      const updated: Routine = { ...routine, lastRun: now.getTime() };
      this.routines.set(routine.id, updated);
      this.saveRoutines();
    } catch (err) {
      console.error(`Failed to fire routine ${routine.id}:`, err);
    }
  }

  private validateSchedule(schedule: string): void {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length === 5) {
      return;
    }
    const weekdayTimePattern = /^(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}):(\d{2})$/i;
    if (weekdayTimePattern.test(schedule)) {
      return;
    }
    throw new Error(
      'Invalid schedule format. Use 5-field cron (e.g., "0 9 * * 1-5") or weekday time (e.g., "Mon 09:00")'
    );
  }
}
