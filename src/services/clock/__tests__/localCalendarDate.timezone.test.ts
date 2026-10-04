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
