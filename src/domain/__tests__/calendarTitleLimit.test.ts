import {
  CALENDAR_TITLE_MAX_LENGTH,
  validateCalendarEvent,
  validateCalendarEventRecord,
} from '../calendarEvent';

const base = { type: 'GAME', startAt: 1_790_000_000_000 };
const en = (n: number) => 'x'.repeat(n);
const he = (n: number) => 'א'.repeat(n);

describe('calendar title limit (100 characters, input only — owner 2026-10-11, was 35)', () => {
  it('is 100 for every CalendarEvent create / edit flow', () => {
    expect(CALENDAR_TITLE_MAX_LENGTH).toBe(100);
  });

  it.each([
    ['English', en],
    ['Hebrew', he],
  ])('%s: 100 characters are accepted; 101 are TOO_LONG (never truncated)', (_label, text) => {
    expect(validateCalendarEvent({ ...base, title: text(100) })).toMatchObject({
      ok: true,
      value: { title: text(100) },
    });
    expect(validateCalendarEvent({ ...base, title: text(101) })).toEqual({
      ok: false,
      errors: { title: 'TOO_LONG' },
    });
  });

  it('existing short titles still work; a title over the old 35 and within 100 now works', () => {
    expect(validateCalendarEvent({ ...base, title: 'Cup' }).ok).toBe(true);
    expect(validateCalendarEvent({ ...base, title: he(36) }).ok).toBe(true);
  });

  it('a fixture title "Home – Away" longer than 35 is kept EXACTLY (no truncation)', () => {
    const fixture = 'הפועל אור עקיבא דור העתיד – הפועל חוף הכרמל'; // 43 characters
    expect(fixture.length).toBeGreaterThan(35);
    expect(validateCalendarEvent({ ...base, title: fixture })).toMatchObject({ ok: true, value: { title: fixture } });
  });

  it('counts after trimming (surrounding spaces do not count)', () => {
    expect(validateCalendarEvent({ ...base, title: `  ${en(100)}  ` }).ok).toBe(true);
  });

  it('OTHER without a title is still REQUIRED_FOR_OTHER; other errors are kept alongside TOO_LONG', () => {
    expect(validateCalendarEvent({ type: 'OTHER', startAt: base.startAt, title: ' ' })).toEqual({
      ok: false,
      errors: { title: 'REQUIRED_FOR_OTHER' },
    });
    expect(validateCalendarEvent({ type: 'SCHOOL', startAt: base.startAt, title: en(101) })).toEqual({
      ok: false,
      errors: { type: 'UNKNOWN_TYPE', title: 'TOO_LONG' },
    });
  });

  it('an edit may keep a longer stored title unchanged — never truncated, never rejected for being kept', () => {
    const legacy = he(130);
    expect(validateCalendarEvent({ ...base, title: legacy }, { storedTitle: legacy })).toMatchObject({
      ok: true,
      value: { title: legacy },
    });
    // Changing it (even shortening, still over 100) must meet the limit.
    expect(validateCalendarEvent({ ...base, title: he(120) }, { storedTitle: legacy })).toEqual({
      ok: false,
      errors: { title: 'TOO_LONG' },
    });
    expect(validateCalendarEvent({ ...base, title: he(100) }, { storedTitle: legacy }).ok).toBe(true);
  });

  it('stored records are not held to the input limit (history stays readable)', () => {
    expect(validateCalendarEventRecord({ ...base, title: en(180), createdAt: 1, updatedAt: 1 })).toMatchObject(
      {
        ok: true,
        value: { title: en(180) },
      },
    );
  });
});
