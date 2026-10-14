import {
  parseCalendarSyncPreferences,
  payloadHash,
  planCalendarSync,
  type ExternalPayload,
  type SyncEvent,
  type SyncLinkView,
} from '..';

/** CAL-SYNC-NOTIFY-001D — the sync plan (owner decisions 2026-10-14, locked). */
const NOW = 1_000_000;
const H = 3_600_000;
const pay = (startAt: number, extra: Partial<ExternalPayload> = {}): ExternalPayload => ({ title: 'Daniel · Game', startAt, endAt: startAt + H, location: null, notes: null, ...extra });
const ev = (id: string, playerId: string, startAt: number, withEnd = true): SyncEvent => ({ id, playerId, startAt, payload: withEnd ? pay(startAt) : null });
const linked = (e: SyncEvent, extra: Partial<SyncLinkView> = {}): SyncLinkView => ({
  eventId: e.id, playerId: e.playerId, calendarId: 'cal-1', externalEventId: `x-${e.id}`, state: 'SYNCED',
  syncedHash: e.payload ? payloadHash('cal-1', e.payload) : null, syncedStartAt: e.startAt, ...extra,
});
const ON = { enabled: true, calendarId: 'cal-1', players: ['p1'] };
const plan = (o: Partial<Parameters<typeof planCalendarSync>[0]> = {}) =>
  planCalendarSync({ prefs: ON, roster: new Set(['p1', 'p2']), events: [], links: [], external: new Map(), now: NOW, ...o });
const kinds = (a: ReturnType<typeof plan>) => a.map((x) => `${x.kind}:${'event' in x ? x.event.id : x.link.eventId}`);

describe('what is mirrored', () => {
  it('future events of the CHOSEN active Players with an end → CREATE; others / past → nothing', () => {
    const a = plan({ events: [ev('e1', 'p1', NOW + H), ev('e2', 'p2', NOW + H), ev('e3', 'p1', NOW - H)] });
    expect(kinds(a)).toEqual(['CREATE:e1']);
  });

  it('OFF by default / no calendar chosen / no Player chosen → nothing at all', () => {
    const events = [ev('e1', 'p1', NOW + H)];
    expect(plan({ prefs: { enabled: false, calendarId: 'cal-1', players: ['p1'] }, events })).toEqual([]);
    expect(plan({ prefs: { enabled: true, calendarId: null, players: ['p1'] }, events })).toEqual([]);
    expect(plan({ prefs: { enabled: true, calendarId: 'cal-1', players: [] }, events })).toEqual([]);
  });

  it('no end time: never created, never an invented end → NEEDS_END_TIME (once; idempotent)', () => {
    const e = ev('e1', 'p1', NOW + H, false);
    expect(kinds(plan({ events: [e] }))).toEqual(['NEEDS_END_TIME:e1']);
    expect(plan({ events: [e], links: [linked(e, { externalEventId: null, state: 'NEEDS_END_TIME' })] })).toEqual([]);
  });

  it('an end added later → CREATE; an end removed from a synced future event → NEEDS_END_TIME (its entry goes)', () => {
    const noEnd = ev('e1', 'p1', NOW + H, false);
    expect(kinds(plan({ events: [ev('e1', 'p1', NOW + H)], links: [linked(noEnd, { externalEventId: null, state: 'NEEDS_END_TIME' })] }))).toEqual(['CREATE:e1']);
    const synced = ev('e2', 'p1', NOW + H);
    const a = plan({ events: [ev('e2', 'p1', NOW + H, false)], links: [linked(synced)] });
    expect(a).toEqual([expect.objectContaining({ kind: 'NEEDS_END_TIME', link: expect.objectContaining({ externalEventId: 'x-e2' }) })]);
  });
});

describe('keeping the mirror right (Gals Coacher is authoritative)', () => {
  it('unchanged → nothing (idempotent); changed in the app → UPDATE', () => {
    const e = ev('e1', 'p1', NOW + H);
    expect(plan({ events: [e], links: [linked(e)], external: new Map([['x-e1', pay(NOW + H)]]) })).toEqual([]);
    const moved = { ...e, payload: pay(NOW + H, { location: 'Gym' }) };
    expect(kinds(plan({ events: [moved], links: [linked(e)], external: new Map([['x-e1', pay(NOW + H)]]) }))).toEqual(['UPDATE:e1']);
  });

  it('edited OUTSIDE the app → UPDATE restores the Gals Coacher version; deleted outside → re-CREATE', () => {
    const e = ev('e1', 'p1', NOW + H);
    expect(kinds(plan({ events: [e], links: [linked(e)], external: new Map([['x-e1', pay(NOW + H, { title: 'edited on the phone' })]]) }))).toEqual(['UPDATE:e1']);
    expect(kinds(plan({ events: [e], links: [linked(e)], external: new Map([['x-e1', null]]) }))).toEqual(['CREATE:e1']);
  });

  it('another calendar chosen → MOVE (delete in the old, create in the new); a failed entry (ERROR) is retried', () => {
    const e = ev('e1', 'p1', NOW + H);
    expect(kinds(plan({ prefs: { ...ON, calendarId: 'cal-2' }, events: [e], links: [linked(e)] }))).toEqual(['MOVE:e1']);
    expect(kinds(plan({ events: [e], links: [linked(e, { state: 'ERROR' })] }))).toEqual(['UPDATE:e1']);
  });
});

describe('leaving the scope: FUTURE entries go, started / past ones stay as history', () => {
  const future = ev('f', 'p1', NOW + H);
  const past = ev('p', 'p1', NOW - H);
  const links = [linked(future), linked(past)];

  it('sync turned OFF', () => {
    expect(kinds(plan({ prefs: { ...ON, enabled: false }, events: [future, past], links }))).toEqual(['REMOVE:f', 'RELEASE:p']);
  });

  it('Player deselected from calendar sync', () => {
    expect(kinds(plan({ prefs: { ...ON, players: [] }, events: [future, past], links }))).toEqual(['REMOVE:f', 'RELEASE:p']);
  });

  it('Player ARCHIVED (off the active roster) — and restored later: future entries come back', () => {
    expect(kinds(plan({ roster: new Set(['p2']), events: [future, past], links }))).toEqual(['REMOVE:f', 'RELEASE:p']);
    expect(kinds(plan({ events: [future, past], links: [] }))).toEqual(['CREATE:f']);
  });

  it('event deleted in the app: its future entry is removed; a past one is released (left in the calendar)', () => {
    expect(kinds(plan({ events: [], links }))).toEqual(['REMOVE:f', 'RELEASE:p']);
  });
});

describe('preferences', () => {
  it('valid only as written; separate Players list; never repaired', () => {
    expect(parseCalendarSyncPreferences({ enabled: true, calendarId: 'c', players: ['a', 'a'] })).toEqual({ enabled: true, calendarId: 'c', players: ['a'] });
    expect(parseCalendarSyncPreferences({ enabled: false, calendarId: null, players: [] })).toEqual({ enabled: false, calendarId: null, players: [] });
    for (const bad of [null, {}, { enabled: 'yes', calendarId: null, players: [] }, { enabled: true, calendarId: '', players: [] }, { enabled: true, calendarId: null, players: [''] }]) {
      expect(parseCalendarSyncPreferences(bad)).toBeNull();
    }
  });
});
