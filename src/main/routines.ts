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

  constructor(fireCallback: RoutineFireCallback) {
    this.routines = new Map();
    this.schedulerInterval = null;
    this.fireCallback = fireCallback;
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
    if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
      throw new Error('Routine name is required and must be a non-empty string');
    }
    if (!input.prompt || typeof input.prompt !== 'string' || input.prompt.trim() === '') {
      throw new Error('Routine prompt is required and must be a non-empty string');
    }
    if (!input.schedule || typeof input.schedule !== 'string' || input.schedule.trim() === '') {
      throw new Error('Routine schedule is required and must be a non-empty string');
    }
    this.validateSchedule(input.schedule);
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const routine: Routine = {
      id,
      name: input.name.trim(),
      prompt: input.prompt.trim(),
      schedule: input.schedule.trim(),
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
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.trim() === '') {
        throw new Error('Routine name must be a non-empty string');
      }
    }
    if (input.prompt !== undefined) {
      if (typeof input.prompt !== 'string' || input.prompt.trim() === '') {
        throw new Error('Routine prompt must be a non-empty string');
      }
    }
    if (input.schedule !== undefined) {
      if (typeof input.schedule !== 'string' || input.schedule.trim() === '') {
        throw new Error('Routine schedule must be a non-empty string');
      }
      this.validateSchedule(input.schedule);
    }
    const updated: Routine = {
      ...routine,
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.prompt !== undefined && { prompt: input.prompt.trim() }),
      ...(input.schedule !== undefined && { schedule: input.schedule.trim() }),
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
      try {
        if (this.shouldFire(routine, now)) {
          this.fireRoutine(routine, now);
        }
      } catch (err) {
        console.error(`Failed to check schedule for routine ${routine.id} (${routine.name}):`, err);
      }
    }
  }

  private shouldFire(routine: Routine, now: Date): boolean {
    if (routine.lastRun) {
      const lastRunDate = new Date(routine.lastRun);
      const currentMinuteSlot = this.getMinuteSlot(now);
      const lastRunMinuteSlot = this.getMinuteSlot(lastRunDate);
      if (currentMinuteSlot === lastRunMinuteSlot) {
        return false;
      }
    }
    return this.matchesSchedule(routine.schedule, now);
  }

  private getMinuteSlot(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    return `${year}-${month}-${day}-${hour}-${minute}`;
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
      if (isNaN(stepValue) || stepValue <= 0) {
        throw new Error(`Invalid step value in cron field: ${field}`);
      }
      if (range === '*') {
        return value % stepValue === 0;
      }
      const [start] = range.split('-').map((n) => parseInt(n, 10));
      if (isNaN(start)) {
        throw new Error(`Invalid range start in cron field: ${field}`);
      }
      return value >= start && (value - start) % stepValue === 0;
    }
    if (field.includes('-')) {
      const [start, end] = field.split('-').map((n) => parseInt(n, 10));
      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid range in cron field: ${field}`);
      }
      return value >= start && value <= end;
    }
    if (field.includes(',')) {
      const values = field.split(',').map((n) => parseInt(n, 10));
      if (values.some((v) => isNaN(v))) {
        throw new Error(`Invalid list in cron field: ${field}`);
      }
      return values.includes(value);
    }
    const fieldValue = parseInt(field, 10);
    if (isNaN(fieldValue)) {
      throw new Error(`Invalid value in cron field: ${field}`);
    }
    return fieldValue === value;
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
    const trimmed = schedule.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length === 5) {
      this.validateCronSchedule(parts);
      return;
    }
    const weekdayTimePattern = /^(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}):(\d{2})$/i;
    const match = trimmed.match(weekdayTimePattern);
    if (match) {
      const hour = parseInt(match[2], 10);
      const minute = parseInt(match[3], 10);
      if (hour < 0 || hour > 23) {
        throw new Error(`Invalid hour in weekday time schedule: ${hour}. Must be 0-23.`);
      }
      if (minute < 0 || minute > 59) {
        throw new Error(`Invalid minute in weekday time schedule: ${minute}. Must be 0-59.`);
      }
      return;
    }
    throw new Error(
      'Invalid schedule format. Use 5-field cron (e.g., "0 9 * * 1-5") or weekday time (e.g., "Mon 09:00")'
    );
  }

  private validateCronSchedule(parts: string[]): void {
    this.validateCronField(parts[0], 0, 59, 'minute');
    this.validateCronField(parts[1], 0, 23, 'hour');
    this.validateCronField(parts[2], 1, 31, 'day of month');
    this.validateCronField(parts[3], 1, 12, 'month');
    this.validateCronField(parts[4], 0, 6, 'day of week');
  }

  private validateCronField(field: string, min: number, max: number, fieldName: string): void {
    if (field === '*') {
      return;
    }
    if (field.includes('/')) {
      const [range, step] = field.split('/');
      const stepValue = parseInt(step, 10);
      if (isNaN(stepValue) || stepValue <= 0) {
        throw new Error(`Invalid step value in ${fieldName}: ${step}`);
      }
      if (range !== '*') {
        if (range.includes('-')) {
          const [start, end] = range.split('-');
          this.validateCronValue(start, min, max, fieldName);
          this.validateCronValue(end, min, max, fieldName);
        } else {
          this.validateCronValue(range, min, max, fieldName);
        }
      }
      return;
    }
    if (field.includes('-')) {
      const [start, end] = field.split('-');
      this.validateCronValue(start, min, max, fieldName);
      this.validateCronValue(end, min, max, fieldName);
      const startVal = parseInt(start, 10);
      const endVal = parseInt(end, 10);
      if (startVal > endVal) {
        throw new Error(`Invalid range in ${fieldName}: start ${startVal} > end ${endVal}`);
      }
      return;
    }
    if (field.includes(',')) {
      const values = field.split(',');
      for (const val of values) {
        this.validateCronValue(val, min, max, fieldName);
      }
      return;
    }
    this.validateCronValue(field, min, max, fieldName);
  }

  private validateCronValue(value: string, min: number, max: number, fieldName: string): void {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error(`Invalid ${fieldName} value: ${value} (not a number)`);
    }
    if (num < min || num > max) {
      throw new Error(`Invalid ${fieldName} value: ${num}. Must be between ${min} and ${max}.`);
    }
  }
}
