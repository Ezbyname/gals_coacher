import { epochToLocalDateTime, localDateTimeToEpoch } from '@/services/clock/localCalendarDate';

import {
  DEFAULT_REMINDER_RULES,
  MAX_REMINDER_RULES,
  REMINDER_WINDOW_DAYS,
  defaultReminderPreferences,
  desiredReminders,
  parseReminderPreferences,
  preselectedPlayers,
  reminderDiff,
  reminderId,
  subscribedPlayers,
  validateReminderRules,
  type LocalClock,
  type ReminderEvent,
  type ReminderPreferences,
} from '..';

/** The app's own DST-safe device-local helpers, as 001C will inject them. */
const clock: LocalClock = { toLocal: epochToLocalDateTime, toEpoch: localDateTimeToEpoch };
const at = (month: number, day: number, hour: number, minute = 0) => new Date(2026, month - 1, day, hour, minute).getTime();
const DANIEL = 'd0000000-0000-4000-8000-000000000001';
const MAYA = 'd0000000-0000-4000-8000-000000000002';
const event = (id: string, startAt: number, extra: Partial<ReminderEvent> = {}): ReminderEvent => ({
  id,
  playerId: DANIEL,
  startAt,
  completion: null,
  ...extra,
});
const on: ReminderPreferences = { enabled: true, rules: DEFAULT_REMINDER_RULES, players: [DANIEL] };
const NOW = at(10, 9, 12); // Fri 9 Oct 2026, 12:00
const when = (ms: number) => {
  const l = epochToLocalDateTime(ms);
  return `${l.day}/${l.month} ${String(l.hour).padStart(2, '0')}:${String(l.minute).padStart(2, '0')}`;
};

describe('reminder rules (0–5, owner defaults)', () => {
  it('the default is 3 rules: 08:00 on the event day, 120 and 30 minutes before', () => {
    expect(DEFAULT_REMINDER_RULES).toEqual([
      { kind: 'DAY_OF_AT', hour: 8, minute: 0 },
      { kind: 'BEFORE_START', minutes: 120 },
      { kind: 'BEFORE_START', minutes: 30 },
    ]);
    expect(MAX_REMINDER_RULES).toBe(5);
  });

  it('0 to 5 rules are valid; a sixth is refused', () => {
    expect(validateReminderRules([])).toEqual({ ok: true, value: [] });
    const five = [10, 20, 30, 40, 50].map((minutes) => ({ kind: 'BEFORE_START', minutes }));
    expect(validateReminderRules(five).ok).toBe(true);
    expect(validateReminderRules([...five, { kind: 'BEFORE_START', minutes: 60 }])).toEqual({
      ok: false,
      error: { code: 'TOO_MANY', max: 5 },
    });
  });

  it('duplicates are refused (same kind and value), different kinds never collide', () => {
    expect(validateReminderRules([{ kind: 'BEFORE_START', minutes: 30 }, { kind: 'BEFORE_START', minutes: 30 }])).toEqual({
      ok: false,
      error: { code: 'DUPLICATE', index: 1, sameAs: 0 },
    });
    expect(validateReminderRules([{ kind: 'DAY_OF_AT', hour: 8, minute: 0 }, { kind: 'DAY_OF_AT', hour: 8, minute: 0 }]).ok).toBe(false);
    expect(validateReminderRules([{ kind: 'DAY_OF_AT', hour: 0, minute: 30 }, { kind: 'BEFORE_START', minutes: 30 }]).ok).toBe(true);
  });

  it.each([
    { kind: 'DAY_OF_AT', hour: 24, minute: 0 },
    { kind: 'DAY_OF_AT', hour: 8, minute: 60 },
    { kind: 'DAY_OF_AT', hour: 8.5, minute: 0 },
    { kind: 'BEFORE_START', minutes: 0 },
    { kind: 'BEFORE_START', minutes: 7 * 24 * 60 + 1 },
    { kind: 'BEFORE_START', minutes: '30' },
    { kind: 'AFTER_END', minutes: 10 },
    null,
  ])('a malformed rule is refused: %p', (rule) => {
    expect(validateReminderRules([rule])).toEqual({ ok: false, error: { code: 'INVALID_RULE', index: 0 } });
  });
});

describe('Player targeting — never a silent subscription to every Player', () => {
  it('exactly one Player is preselected; none or several → nobody until chosen', () => {
    expect(preselectedPlayers([DANIEL])).toEqual([DANIEL]);
    expect(preselectedPlayers([])).toEqual([]);
    expect(preselectedPlayers([DANIEL, MAYA])).toEqual([]);
    expect(defaultReminderPreferences([DANIEL, MAYA])).toEqual({ enabled: false, rules: DEFAULT_REMINDER_RULES, players: [] });
    expect(defaultReminderPreferences([DANIEL]).players).toEqual([DANIEL]);
  });

  it('a Player added later is not subscribed; a vanished one drops out', () => {
    const prefs = { ...on, players: [DANIEL] };
    expect(subscribedPlayers(prefs, [DANIEL, MAYA])).toEqual([DANIEL]);
    expect(subscribedPlayers({ ...on, players: [DANIEL, MAYA] }, [MAYA])).toEqual([MAYA]);
  });

  it('a stored preference is accepted only when every field is valid (never repaired)', () => {
    expect(parseReminderPreferences({ enabled: true, rules: DEFAULT_REMINDER_RULES, players: [DANIEL, DANIEL] })).toEqual({
      enabled: true,
      rules: DEFAULT_REMINDER_RULES,
      players: [DANIEL],
    });
    expect(parseReminderPreferences({ enabled: 'yes', rules: [], players: [] })).toBeNull();
    expect(parseReminderPreferences({ enabled: true, rules: [{ kind: 'BEFORE_START', minutes: 0 }], players: [] })).toBeNull();
    expect(parseReminderPreferences({ enabled: true, rules: [], players: ['ALL', ''] })).toBeNull();
    expect(parseReminderPreferences({ enabled: true, rules: [] })).toBeNull();
  });
});

describe('desiredReminders (30-day window, skips, no catch-up)', () => {
  it('Tuesday 18:40 → 08:00 that day, 16:40 and 18:10', () => {
    const r = desiredReminders([event('e1', at(10, 13, 18, 40))], on, NOW, clock);
    expect(r.map((x) => [when(x.at), x.ruleIndex])).toEqual([
      ['13/10 08:00', 0],
      ['13/10 16:40', 1],
      ['13/10 18:10', 2],
    ]);
    expect(r[0]!.id).toBe(reminderId('e1', 0, at(10, 13, 8)));
  });

  it('a day-of time after the start is skipped, never moved (07:00 training: no 08:00 reminder)', () => {
    const r = desiredReminders([event('early', at(10, 14, 7))], on, NOW, clock);
    expect(r.map((x) => when(x.at))).toEqual(['14/10 05:00', '14/10 06:30']);
  });

  it('a day-of time equal to the start is kept', () => {
    const r = desiredReminders([event('eight', at(10, 14, 8))], { ...on, rules: [{ kind: 'DAY_OF_AT', hour: 8, minute: 0 }] }, NOW, clock);
    expect(r.map((x) => when(x.at))).toEqual(['14/10 08:00']);
  });

  it('past instants are skipped — no catch-up reminder', () => {
    const r = desiredReminders([event('e1', at(10, 13, 18, 40))], on, at(10, 13, 17), clock);
    expect(r.map((x) => when(x.at))).toEqual(['13/10 18:10']);
    expect(desiredReminders([event('gone', at(10, 9, 11))], on, NOW, clock)).toEqual([]);
  });

  it(`only the next ${REMINDER_WINDOW_DAYS} days are scheduled`, () => {
    const inside = event('in', NOW + 29 * 86_400_000 + 3_600_000);
    const outside = event('out', NOW + 31 * 86_400_000 + 3 * 3_600_000);
    const r = desiredReminders([inside, outside], { ...on, rules: [{ kind: 'BEFORE_START', minutes: 30 }] }, NOW, clock);
    expect(r.map((x) => x.eventId)).toEqual(['in']);
  });

  it('completed events, unsubscribed Players, reminders off or 0 rules → nothing', () => {
    expect(desiredReminders([event('done', at(10, 13, 18), { completion: { completedAt: 1 } })], on, NOW, clock)).toEqual([]);
    expect(desiredReminders([event('maya', at(10, 13, 18), { playerId: MAYA })], on, NOW, clock)).toEqual([]);
    expect(desiredReminders([event('e1', at(10, 13, 18))], { ...on, enabled: false }, NOW, clock)).toEqual([]);
    expect(desiredReminders([event('e1', at(10, 13, 18))], { ...on, rules: [] }, NOW, clock)).toEqual([]);
  });

  it('a local time that does not exist (DST gap) is skipped, never shifted', () => {
    const gap: LocalClock = { toLocal: epochToLocalDateTime, toEpoch: () => null };
    const r = desiredReminders([event('e1', at(10, 13, 18, 40))], on, NOW, gap);
    expect(r.map((x) => x.ruleIndex)).toEqual([1, 2]);
  });

  it('ids are deterministic and change when the event time changes', () => {
    const a = desiredReminders([event('e1', at(10, 13, 18, 40))], on, NOW, clock);
    const again = desiredReminders([event('e1', at(10, 13, 18, 40))], on, NOW, clock);
    const moved = desiredReminders([event('e1', at(10, 13, 19, 0))], on, NOW, clock);
    expect(again.map((x) => x.id)).toEqual(a.map((x) => x.id));
    expect(moved[1]!.id).not.toBe(a[1]!.id);
    expect(moved[0]!.id).toBe(a[0]!.id); // 08:00 that day did not move
  });
});

describe('reminderDiff (what the engine changes)', () => {
  const desired = desiredReminders([event('e1', at(10, 13, 18, 40))], on, NOW, clock);

  it('schedules the missing, cancels our stale ones, never touches other notifications; idempotent', () => {
    const stale = reminderId('deleted', 0, at(10, 12, 8));
    const d = reminderDiff(desired, [desired[0]!.id, stale, 'other-app-thing']);
    expect(d.schedule.map((x) => x.id)).toEqual([desired[1]!.id, desired[2]!.id]);
    expect(d.cancel).toEqual([stale]);
    const after = [desired[0]!.id, ...d.schedule.map((x) => x.id), 'other-app-thing'];
    expect(reminderDiff(desired, after)).toEqual({ schedule: [], cancel: [] });
  });

  it('turning reminders off cancels every one of ours', () => {
    const d = reminderDiff([], desired.map((x) => x.id));
    expect(d.schedule).toEqual([]);
    expect(d.cancel).toHaveLength(3);
  });
});
