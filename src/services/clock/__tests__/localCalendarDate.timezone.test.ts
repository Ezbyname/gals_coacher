import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Jest workers cannot switch timezone in-process (assigning process.env.TZ
 * there does not change Date's local timezone), so each timezone runs the
 * real helper module in a child Node process started with TZ set. Every run
 * first proves the child's runtime really is in that timezone.
 */
const HELPER = resolve(__dirname, '../localCalendarDate.ts');

type Probe = {
  tz: string;
  intlZone: string;
  januaryOffset: number;
  results: Record<string, unknown>;
};

function runIn(tz: string, body: string): Probe {
  const script = `
    const m = require(${JSON.stringify(HELPER)});
    const results = {};
    ${body}
    console.log(JSON.stringify({
      tz: process.env.TZ,
      intlZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      januaryOffset: new Date(2026, 0, 15, 12).getTimezoneOffset(),
      results,
    }));
  `;
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', script], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  if (child.status !== 0) throw new Error(`child failed in ${tz}: ${child.stderr}`);
  return JSON.parse(child.stdout.trim().split('\n').pop()!) as Probe;
}

describe('local civil-date conversion in real timezones (child processes)', () => {
  it('Asia/Jerusalem (UTC+2/+3): a late-evening / after-midnight pick keeps its local day', () => {
    // 2026-03-27 is Israel's DST start (02:00). 00:30 local is 22:30 UTC the day before.
    const probe = runIn(
      'Asia/Jerusalem',
      `
      const picked = new Date(2026, 2, 27, 0, 30);
      results.picked = m.localDateToCalendarDate(picked);
      results.isoDayWouldBe = picked.toISOString().slice(0, 10);
      const noon = m.calendarDateToLocalNoon({ year: 2026, month: 3, day: 27 });
      results.noonBack = m.localDateToCalendarDate(noon);
      results.noonHour = noon.getHours();
      results.lateEvening = m.localDateToCalendarDate(new Date(2026, 9, 3, 23, 45));
    `,
    );
    // Proof the child really ran in Jerusalem time (UTC+2 in January).
    expect(probe.tz).toBe('Asia/Jerusalem');
    expect(probe.intlZone).toBe('Asia/Jerusalem');
    expect(probe.januaryOffset).toBe(-120);
    // The test is sensitive: a UTC/ISO conversion would give the previous day here.
    expect(probe.results.isoDayWouldBe).toBe('2026-03-26');
    expect(probe.results.picked).toEqual({ year: 2026, month: 3, day: 27 });
    expect(probe.results.noonBack).toEqual({ year: 2026, month: 3, day: 27 });
    expect(probe.results.noonHour).toBe(12);
    expect(probe.results.lateEvening).toEqual({ year: 2026, month: 10, day: 3 });
  });

  it('America/Los_Angeles (UTC-8/-7): a late-evening pick keeps its local day', () => {
    // 2026-03-08 is the US DST start (02:00). 23:30 local is 06:30 UTC the next day.
    const probe = runIn(
      'America/Los_Angeles',
      `
      const picked = new Date(2026, 2, 8, 23, 30);
      results.picked = m.localDateToCalendarDate(picked);
      results.isoDayWouldBe = picked.toISOString().slice(0, 10);
      const noon = m.calendarDateToLocalNoon({ year: 2026, month: 3, day: 8 });
      results.noonBack = m.localDateToCalendarDate(noon);
      results.noonHour = noon.getHours();
      results.earlyMorning = m.localDateToCalendarDate(new Date(2026, 0, 1, 0, 15));
    `,
    );
    expect(probe.tz).toBe('America/Los_Angeles');
    expect(probe.intlZone).toBe('America/Los_Angeles');
    expect(probe.januaryOffset).toBe(480);
    expect(probe.results.isoDayWouldBe).toBe('2026-03-09');
    expect(probe.results.picked).toEqual({ year: 2026, month: 3, day: 8 });
    expect(probe.results.noonBack).toEqual({ year: 2026, month: 3, day: 8 });
    expect(probe.results.noonHour).toBe(12);
    expect(probe.results.earlyMorning).toEqual({ year: 2026, month: 1, day: 1 });
  });
});

/**
 * Local date-time entry (calendar events). The 2026 transitions used below
 * were read from this runtime's timezone data and each test re-proves them in
 * its own child before relying on them:
 * - Asia/Jerusalem: 27 Mar 02:00 → 03:00 (02:30 does not exist);
 *   25 Oct 02:00 → 01:00 (01:30 happens twice).
 * - America/Los_Angeles: 8 Mar 02:00 → 03:00 (02:30 does not exist);
 *   1 Nov 02:00 → 01:00 (01:30 happens twice).
 */
describe('localDateTimeToEpoch in real timezones (child processes)', () => {
  const ZONES = [
    { tz: 'Asia/Jerusalem', gapDay: 27, gapMonth: 3, backDay: 25, backMonth: 10, std: -120, dst: -180 },
    { tz: 'America/Los_Angeles', gapDay: 8, gapMonth: 3, backDay: 1, backMonth: 11, std: 480, dst: 420 },
  ] as const;

  it.each(ZONES)('$tz: a spring-forward wall time that does not exist is rejected', (z) => {
    const probe = runIn(
      z.tz,
      `
      const at = (h, mi) => new Date(2026, ${z.gapMonth - 1}, ${z.gapDay}, h, mi);
      results.before = at(1, 59).getTimezoneOffset();
      results.after = at(3, 0).getTimezoneOffset();
      results.jsShifts = at(2, 30).getHours() + ':' + at(2, 30).getMinutes();
      results.helper = m.localDateTimeToEpoch({ year: 2026, month: ${z.gapMonth}, day: ${z.gapDay}, hour: 2, minute: 30 });
      results.justBefore = m.localDateTimeToEpoch({ year: 2026, month: ${z.gapMonth}, day: ${z.gapDay}, hour: 1, minute: 59 });
      results.justAfter = m.localDateTimeToEpoch({ year: 2026, month: ${z.gapMonth}, day: ${z.gapDay}, hour: 3, minute: 0 });
      results.justAfterBack = m.epochToLocalDateTime(results.justAfter);
    `,
    );
    expect(probe.tz).toBe(z.tz);
    expect(probe.intlZone).toBe(z.tz);
    // Proof this is a real transition in this runtime: the offset changes by an hour …
    expect([probe.results.before, probe.results.after]).toEqual([z.std, z.dst]);
    // … and plain Date silently moves 02:30 to 03:30.
    expect(probe.results.jsShifts).toBe('3:30');
    // The helper refuses it instead of saving a different time.
    expect(probe.results.helper).toBeNull();
    expect(typeof probe.results.justBefore).toBe('number');
    expect(probe.results.justAfterBack).toEqual({
      year: 2026,
      month: z.gapMonth,
      day: z.gapDay,
      hour: 3,
      minute: 0,
    });
  });

  it.each(ZONES)(
    '$tz: a fall-back wall time that happens twice resolves to the EARLIER instant (V8 / Node)',
    (z) => {
      const probe = runIn(
        z.tz,
        `
      const input = { year: 2026, month: ${z.backMonth}, day: ${z.backDay}, hour: 1, minute: 30 };
      const epoch = m.localDateTimeToEpoch(input);
      results.epoch = epoch;
      results.offset = new Date(epoch).getTimezoneOffset();
      results.back = m.epochToLocalDateTime(epoch);
      // The same wall time one hour later (after the clocks went back):
      results.secondOffset = new Date(epoch + 3600000).getTimezoneOffset();
      results.secondBack = m.epochToLocalDateTime(epoch + 3600000);
    `,
      );
      expect(probe.intlZone).toBe(z.tz);
      // Both instants show 01:30 locally: the wall time really is ambiguous here.
      const wall = { year: 2026, month: z.backMonth, day: z.backDay, hour: 1, minute: 30 };
      expect(probe.results.back).toEqual(wall);
      expect(probe.results.secondBack).toEqual(wall);
      // Observed platform behaviour: the first (daylight-time) occurrence is chosen.
      expect(probe.results.offset).toBe(z.dst);
      expect(probe.results.secondOffset).toBe(z.std);
    },
  );

  it('a late-evening Jerusalem local time keeps its local date (same UTC day, 20:30Z) without UTC-date slicing', () => {
    const probe = runIn(
      'Asia/Jerusalem',
      `
      const epoch = m.localDateTimeToEpoch({ year: 2026, month: 10, day: 6, hour: 23, minute: 30 });
      results.epoch = epoch;
      results.utcDay = new Date(epoch).toISOString().slice(0, 10);
      results.back = m.epochToLocalDateTime(epoch);
    `,
    );
    expect(probe.intlZone).toBe('Asia/Jerusalem');
    expect(probe.results.epoch).toBe(Date.UTC(2026, 9, 6, 20, 30));
    expect(probe.results.utcDay).toBe('2026-10-06');
    expect(probe.results.back).toEqual({ year: 2026, month: 10, day: 6, hour: 23, minute: 30 });
  });

  it('an early-morning local time belongs to the previous UTC day but keeps its local date (Jerusalem)', () => {
    const probe = runIn(
      'Asia/Jerusalem',
      `
      const epoch = m.localDateTimeToEpoch({ year: 2026, month: 10, day: 7, hour: 1, minute: 15 });
      results.utcDay = new Date(epoch).toISOString().slice(0, 10);
      results.back = m.epochToLocalDateTime(epoch);
    `,
    );
    expect(probe.results.utcDay).toBe('2026-10-06');
    expect(probe.results.back).toEqual({ year: 2026, month: 10, day: 7, hour: 1, minute: 15 });
  });

  it('a late-evening local time keeps its local date in Los Angeles too (next UTC day)', () => {
    const probe = runIn(
      'America/Los_Angeles',
      `
      const epoch = m.localDateTimeToEpoch({ year: 2026, month: 10, day: 6, hour: 21, minute: 0 });
      results.utcDay = new Date(epoch).toISOString().slice(0, 10);
      results.back = m.epochToLocalDateTime(epoch);
    `,
    );
    expect(probe.intlZone).toBe('America/Los_Angeles');
    expect(probe.results.utcDay).toBe('2026-10-07');
    expect(probe.results.back).toEqual({ year: 2026, month: 10, day: 6, hour: 21, minute: 0 });
  });
});
