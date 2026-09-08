import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  get(key: string): unknown | null {
    try {
      const item = localStorage.getItem(key);
      return item === null ? null : JSON.parse(item);
    } catch {
      return null;
    }
  }

  set(key: string, value: unknown): boolean {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) return false;
      localStorage.setItem(key, serialized);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
}
