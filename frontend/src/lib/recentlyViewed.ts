import type { NoteItem } from '../types';

const STORAGE_KEY = 'notesindia_guest_recently_viewed';

export function recordGuestView(note: NoteItem): void {
  try {
    const existing = getGuestRecentlyViewed().filter((n) => n.id !== note.id);
    const updated = [note, ...existing].slice(0, 10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage quota errors
  }
}

export function getGuestRecentlyViewed(): NoteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NoteItem[]) : [];
  } catch {
    return [];
  }
}
