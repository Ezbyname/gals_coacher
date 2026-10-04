import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Jest cannot switch timezone in-process, so the real formatter runs in child
 * Node processes started with TZ set; each first proves its timezone.
 */
const FORMATTER = resolve(__dirname, '../formatTakenAt.ts');

function formatIn(tz: string, takenAt: number) {
  const script = `
    const { formatTakenAt } = require(${JSON.stringify(FORMATTER)});
    console.log(JSON.stringify({
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      he: formatTakenAt(${takenAt}, 'he'),
      en: formatTakenAt(${takenAt}, 'en'),
    }));
  `;
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', script], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  if (child.status !== 0) throw new Error(`child failed in ${tz}: ${child.stderr}`);
  return JSON.parse(child.stdout.trim().split('\n').pop()!) as { zone: string; he: string; en: string };
}

describe('self-assessment date/time is shown in LOCAL time, in the app language', () => {
  // 3 Oct 2026 22:30 UTC — already 4 Oct 01:30 in Jerusalem (UTC+3).
  const lateUtc = Date.UTC(2026, 9, 3, 22, 30);
  // 4 Oct 2026 05:30 UTC — still 3 Oct 22:30 in Los Angeles (UTC-7).
  const earlyUtc = Date.UTC(2026, 9, 4, 5, 30);

  it('Asia/Jerusalem: the local day and time, not the UTC ones', () => {
    const out = formatIn('Asia/Jerusalem', lateUtc);
    expect(out.zone).toBe('Asia/Jerusalem');
    expect(out.he).toBe('4 באוקטובר 2026 בשעה 01:30');
    expect(out.en).toBe('4 October 2026 at 01:30');
  });

  it('America/Los_Angeles: the local day and time, not the UTC ones', () => {
    const out = formatIn('America/Los_Angeles', earlyUtc);
    expect(out.zone).toBe('America/Los_Angeles');
    expect(out.he).toBe('3 באוקטובר 2026 בשעה 22:30');
    expect(out.en).toBe('3 October 2026 at 22:30');
  });

  it('control: the same instants in UTC show the other calendar day (the cases above are sensitive)', () => {
    expect(formatIn('UTC', lateUtc).en).toBe('3 October 2026 at 22:30');
    expect(formatIn('UTC', earlyUtc).en).toBe('4 October 2026 at 05:30');
  });
});
