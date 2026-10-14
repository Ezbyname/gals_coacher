/**
 * CAL-SYNC-NOTIFY-001C — "the inputs of the reminder schedule changed": emitted
 * AFTER a successful write (a calendar event, a Player, the reminder preference).
 * The reminder engine listens and reconciles. A listener can never affect the
 * write: it runs after the commit, and its errors are caught here.
 */
export type DataTopic = 'calendar' | 'players' | 'reminders' | 'calendarSync';
type Listener = (topic: DataTopic) => void;

const listeners = new Set<Listener>();

export function onDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitDataChanged(topic: DataTopic): void {
  for (const listener of [...listeners]) {
    try {
      listener(topic);
    } catch (e) {
      console.warn('[data] change listener failed', e);
    }
  }
}
