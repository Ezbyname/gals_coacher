/**
 * CAL-SYNC-NOTIFY-001D — optional ONE-WAY mirror of CalendarEvents into one device
 * calendar (pure planning; the engine applies it). Owner decisions 2026-10-14 (locked):
 *
 *  - CalendarEvent is authoritative; the device calendar is a projection. An external
 *    edit is overwritten (restored) at the next sync; external data never flows back.
 *  - Sync scope = enabled + a chosen writable calendar + EXPLICITLY chosen ACTIVE
 *    Players (a selection independent of reminders).
 *  - Future events are managed; started / past entries are HISTORY: never deleted,
 *    never rewritten — when they leave the scope they are only released.
 *  - Out of scope (sync off, Player deselected or archived, event deleted): future
 *    Gals Coacher entries are removed; past / started ones stay.
 *  - endAt NULL: nothing is created and no end is invented → NEEDS_END_TIME.
 *  - Only entries recorded in our sync links are ever touched.
 */
export interface CalendarSyncPreferences {
  /** Off until the user turns it on. */
  readonly enabled: boolean;
  /** The ONE device calendar chosen by the user (never chosen automatically). */
  readonly calendarId: string | null;
  /** Explicitly chosen Players — independent of the reminder Players. */
  readonly players: readonly string[];
}

export const DEFAULT_CALENDAR_SYNC: CalendarSyncPreferences = { enabled: false, calendarId: null, players: [] };

/** A stored / incoming value as valid preferences, or null (nothing repaired silently). */
export function parseCalendarSyncPreferences(value: unknown): CalendarSyncPreferences | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean') return null;
  if (v.calendarId !== null && !(typeof v.calendarId === 'string' && v.calendarId.length > 0)) return null;
  if (!Array.isArray(v.players) || !v.players.every((p) => typeof p === 'string' && p.length > 0)) return null;
  return { enabled: v.enabled, calendarId: v.calendarId as string | null, players: [...new Set(v.players as string[])] };
}

/** What the device calendar entry shows (known data only). */
export interface ExternalPayload {
  readonly title: string;
  readonly startAt: number;
  readonly endAt: number;
  readonly location: string | null;
  readonly notes: string | null;
}

/** An event as the planner needs it; `payload` null ⇔ the event has no end (NEEDS_END_TIME). */
export interface SyncEvent {
  readonly id: string;
  readonly playerId: string;
  readonly startAt: number;
  readonly payload: ExternalPayload | null;
}

/** What we recorded about an entry we created (subset of the link row). */
export interface SyncLinkView {
  readonly eventId: string;
  readonly playerId: string;
  readonly calendarId: string;
  readonly externalEventId: string | null;
  readonly state: 'SYNCED' | 'NEEDS_END_TIME' | 'ERROR';
  readonly syncedHash: string | null;
  readonly syncedStartAt: number;
}

export type SyncAction =
  | { readonly kind: 'CREATE'; readonly event: SyncEvent; readonly payload: ExternalPayload; readonly hash: string }
  | { readonly kind: 'UPDATE'; readonly link: SyncLinkView; readonly event: SyncEvent; readonly payload: ExternalPayload; readonly hash: string }
  /** The chosen calendar changed: delete our entry in the old calendar, create it in the new one. */
  | { readonly kind: 'MOVE'; readonly link: SyncLinkView; readonly event: SyncEvent; readonly payload: ExternalPayload; readonly hash: string }
  /** No end: nothing in the device calendar (a future entry we made earlier is deleted). */
  | { readonly kind: 'NEEDS_END_TIME'; readonly event: SyncEvent; readonly link: SyncLinkView | null }
  /** A FUTURE entry of ours that is no longer wanted: delete it, forget the link. */
  | { readonly kind: 'REMOVE'; readonly link: SyncLinkView }
  /** A started / past entry leaving the scope: keep it in the calendar as history, stop managing it. */
  | { readonly kind: 'RELEASE'; readonly link: SyncLinkView };

/** The content version of an entry (deterministic; also covers the calendar it lives in). */
export function payloadHash(calendarId: string, p: ExternalPayload): string {
  return JSON.stringify([calendarId, p.title, p.startAt, p.endAt, p.location, p.notes]);
}

const samePayload = (a: ExternalPayload, b: ExternalPayload) =>
  a.title === b.title && a.startAt === b.startAt && a.endAt === b.endAt && (a.location ?? null) === (b.location ?? null) && (a.notes ?? null) === (b.notes ?? null);

export function planCalendarSync(input: {
  readonly prefs: CalendarSyncPreferences;
  /** Ids of the ACTIVE Players (archived Players are not in it). */
  readonly roster: ReadonlySet<string>;
  /** Events that start after `now` (and any other events — past ones are ignored). */
  readonly events: readonly SyncEvent[];
  readonly links: readonly SyncLinkView[];
  /** What the device calendar currently holds for our managed FUTURE entries (null = gone). */
  readonly external: ReadonlyMap<string, ExternalPayload | null>;
  readonly now: number;
}): SyncAction[] {
  const { prefs, now } = input;
  const calendarId = prefs.enabled ? prefs.calendarId : null;
  const scope = calendarId === null ? new Set<string>() : new Set(prefs.players.filter((p) => input.roster.has(p)));
  const links = new Map(input.links.map((l) => [l.eventId, l]));
  const wanted = new Set<string>();
  const actions: SyncAction[] = [];

  for (const event of input.events) {
    if (event.startAt <= now || !scope.has(event.playerId) || calendarId === null) continue;
    wanted.add(event.id);
    const link = links.get(event.id) ?? null;
    if (event.payload === null) {
      // Idempotent: already recorded as waiting for an end, with nothing in the calendar.
      if (!(link?.state === 'NEEDS_END_TIME' && link.externalEventId === null)) actions.push({ kind: 'NEEDS_END_TIME', event, link });
      continue;
    }
    const hash = payloadHash(calendarId, event.payload);
    if (link === null || link.externalEventId === null) {
      actions.push({ kind: 'CREATE', event, payload: event.payload, hash });
    } else if (link.calendarId !== calendarId) {
      actions.push({ kind: 'MOVE', link, event, payload: event.payload, hash });
    } else {
      const outside = input.external.get(link.externalEventId);
      if (outside === null) actions.push({ kind: 'CREATE', event, payload: event.payload, hash }); // deleted outside: recreated
      else if (link.state !== 'SYNCED' || link.syncedHash !== hash || (outside !== undefined && !samePayload(outside, event.payload))) {
        actions.push({ kind: 'UPDATE', link, event, payload: event.payload, hash }); // changed here, or edited outside: restored
      }
    }
  }

  for (const link of input.links) {
    if (wanted.has(link.eventId)) continue;
    actions.push(link.syncedStartAt > now ? { kind: 'REMOVE', link } : { kind: 'RELEASE', link });
  }
  return actions;
}
