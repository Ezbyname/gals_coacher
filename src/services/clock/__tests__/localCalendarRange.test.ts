import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { eventLocalDates, localDateRange, localDayStart } from '../localCalendarDate';

/**
 * The Full Calendar's local-day projection (CAL-VIEW-001): an event occupies
 * the local civil dates of [startAt, endAt). Epochs are built from LOCAL
 * components so the in-process cases hold in any machine timezone; the
 * child-process cases prove real zones (incl. DST days) never shift a day.
 */
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const date = (year: number, month: number, day: number) => ({ year, month, day });

describe('eventLocalDates: the local dates an event occupies, end exclusive', () => {
  it.each([
    ['same-day event', at(2026, 10, 6, 18), at(2026, 10, 6, 19, 30), date(2026, 10, 6), date(2026, 10, 6)],
    ['overnight event', at(2026, 10, 6, 23), at(2026, 10, 7, 1), date(2026, 10, 6), date(2026, 10, 7)],
    ['multi-day event', at(2026, 10, 6, 9), at(2026, 10, 9, 17), date(2026, 10, 6), date(2026, 10, 9)],
    [
      'ends exactly at midnight: not the next day',
      at(2026, 10, 6, 22),
      at(2026, 10, 7),
      date(2026, 10, 6),
      date(2026, 10, 6),
    ],
    [
      'ends 1 ms after midnight: reaches the next day',
      at(2026, 10, 6, 22),
      at(2026, 10, 7) + 1,
      date(2026, 10, 6),
      date(2026, 10, 7),
    ],
    ['starts exactly at midnight', at(2026, 10, 7), at(2026, 10, 7, 1), date(2026, 10, 7), date(2026, 10, 7)],
    [
      'over a month and year end',
      at(2026, 12, 31, 20),
      at(2027, 1, 1, 2),
      date(2026, 12, 31),
      date(2027, 1, 1),
    ],
    ['no end: its start date only', at(2026, 10, 6, 23, 30), null, date(2026, 10, 6), date(2026, 10, 6)],
  ])('%s', (_name, startAt, endAt, first, last) => {
    expect(eventLocalDates(startAt, endAt)).toEqual({ first, last });
  });

  it('never changes the event (it only reads two numbers)', () => {
    const event = Object.freeze({ startAt: at(2026, 10, 6, 23), endAt: at(2026, 10, 7, 1) });
    eventLocalDates(event.startAt, event.endAt);
    expect(event).toEqual({ startAt: at(2026, 10, 6, 23), endAt: at(2026, 10, 7, 1) });
  });
});

describe('local day boundaries', () => {
  it('a day starts at local midnight; a range ends at the start of the day after its last', () => {
    expect(localDayStart(date(2026, 10, 6))).toBe(at(2026, 10, 6));
    expect(localDateRange(date(2026, 9, 27), date(2026, 10, 31))).toEqual({
      from: at(2026, 9, 27),
      to: at(2026, 11, 1),
    });
    expect(localDateRange(date(2026, 12, 27), date(2027, 1, 2))).toEqual({
      from: at(2026, 12, 27),
      to: at(2027, 1, 3),
    });
  });
});

const HELPER = resolve(__dirname, '../localCalendarDate.ts');

function runIn(tz: string, body: string) {
  const script = `
    const m = require(${JSON.stringify(HELPER)});
    const results = {};
    ${body}
    console.log(JSON.stringify({ tz: process.env.TZ, intlZone: Intl.DateTimeFormat().resolvedOptions().timeZone, results }));
  `;
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', script], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  if (child.status !== 0) throw new Error(`child failed in ${tz}: ${child.stderr}`);
  return JSON.parse(child.stdout.trim().split('\n').pop()!) as {
    tz: string;
    intlZone: string;
    results: Record<string, unknown>;
  };
}

describe('real timezones (child processes): no UTC day shift', () => {
  const BODY = `
    const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
    results.lateEvening = m.eventLocalDates(at(2026, 10, 6, 23, 30), null);
    results.isoWouldBe = new Date(at(2026, 10, 6, 23, 30)).toISOString().slice(0, 10);
    results.earlyMorning = m.eventLocalDates(at(2026, 10, 7, 0, 30), null);
    results.overnight = m.eventLocalDates(at(2026, 10, 6, 23), at(2026, 10, 7, 1));
    results.toMidnight = m.eventLocalDates(at(2026, 10, 6, 22), at(2026, 10, 7));
    results.dstDay = m.localDateRange({ year: 2026, month: 3, day: DST_DAY }, { year: 2026, month: 3, day: DST_DAY });
    results.dstDayHours = (results.dstDay.to - results.dstDay.from) / 3600000;
    results.dstEvening = m.eventLocalDates(at(2026, 3, DST_DAY, 23, 30), null);
  `;

  it.each([
    { tz: 'Asia/Jerusalem', dstDay: 27, dayHours: 23, isoWouldBe: '2026-10-06' },
    { tz: 'America/Los_Angeles', dstDay: 8, dayHours: 23, isoWouldBe: '2026-10-07' },
    { tz: 'Pacific/Auckland', dstDay: 8, dayHours: 24, isoWouldBe: '2026-10-06' },
  ])('$tz', ({ tz, dstDay, dayHours, isoWouldBe }) => {
    const probe = runIn(tz, BODY.replaceAll('DST_DAY', String(dstDay)));
    expect(probe.tz).toBe(tz);
    expect(probe.intlZone).toBe(tz);
    const day = (d: number, mo = 10) => ({ year: 2026, month: mo, day: d });
    expect(probe.results.isoWouldBe).toBe(isoWouldBe);
    expect(probe.results.lateEvening).toEqual({ first: day(6), last: day(6) });
    expect(probe.results.earlyMorning).toEqual({ first: day(7), last: day(7) });
    expect(probe.results.overnight).toEqual({ first: day(6), last: day(7) });
    expect(probe.results.toMidnight).toEqual({ first: day(6), last: day(6) });
    expect(probe.results.dstEvening).toEqual({ first: day(dstDay, 3), last: day(dstDay, 3) });
    // The spring-forward day (Jerusalem, Los Angeles) is 23 hours yet still exactly one civil day;
    // Auckland's 8 March is an ordinary day (24 hours).
    expect(probe.results.dstDayHours).toBe(dayHours);
  });
});
