import {
  CALENDAR_TITLE_MAX_LENGTH,
  validateCalendarEvent,
  validateCalendarEventRecord,
} from '../calendarEvent';

const base = { type: 'GAME', startAt: 1_790_000_000_000 };
const en = (n: number) => 'x'.repeat(n);
const he = (n: number) => 'א'.repeat(n);

describe('calendar title limit (35 characters, input only)', () => {
  it('is 35', () => {
    expect(CALENDAR_TITLE_MAX_LENGTH).toBe(35);
  });

  it.each([
    ['English', en],
    ['Hebrew', he],
  ])('%s: 35 characters are accepted; 36 are TOO_LONG', (_label, text) => {
    expect(validateCalendarEvent({ ...base, title: text(35) })).toMatchObject({
      ok: true,
      value: { title: text(35) },
    });
    expect(validateCalendarEvent({ ...base, title: text(36) })).toEqual({
      ok: false,
      errors: { title: 'TOO_LONG' },
    });
  });

  it('counts after trimming (surrounding spaces do not count)', () => {
    expect(validateCalendarEvent({ ...base, title: `  ${en(35)}  ` }).ok).toBe(true);
  });

  it('OTHER without a title is still REQUIRED_FOR_OTHER; other errors are kept alongside TOO_LONG', () => {
    expect(validateCalendarEvent({ type: 'OTHER', startAt: base.startAt, title: ' ' })).toEqual({
      ok: false,
      errors: { title: 'REQUIRED_FOR_OTHER' },
    });
    expect(validateCalendarEvent({ type: 'SCHOOL', startAt: base.startAt, title: en(36) })).toEqual({
      ok: false,
      errors: { type: 'UNKNOWN_TYPE', title: 'TOO_LONG' },
    });
  });

  it('an edit may keep a longer stored title unchanged — never truncated, never rejected for being kept', () => {
    const legacy = he(50);
    expect(validateCalendarEvent({ ...base, title: legacy }, { storedTitle: legacy })).toMatchObject({
      ok: true,
      value: { title: legacy },
    });
    // Changing it (even shortening, still over 35) must meet the limit.
    expect(validateCalendarEvent({ ...base, title: he(45) }, { storedTitle: legacy })).toEqual({
      ok: false,
      errors: { title: 'TOO_LONG' },
    });
    expect(validateCalendarEvent({ ...base, title: he(35) }, { storedTitle: legacy }).ok).toBe(true);
  });

  it('stored records are not held to the input limit (history stays readable)', () => {
    expect(validateCalendarEventRecord({ ...base, title: en(80), createdAt: 1, updatedAt: 1 })).toMatchObject(
      {
        ok: true,
        value: { title: en(80) },
      },
    );
  });
});
