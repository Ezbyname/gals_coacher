import { calendarDate, type CalendarDate } from '../../calendarDate';
import { parseSchedule, type ParsedSession } from '../parseSchedule';
import { WHATSAPP_EXAMPLE_1, WHATSAPP_EXAMPLE_2 } from './whatsappFixtures';

/** The chosen week in these tests: Sun 11 Oct – Sat 17 Oct 2026. */
const WEEK_START = calendarDate(2026, 10, 11)!;
const parse = (text: string, weekStart: CalendarDate = WEEK_START) => parseSchedule(text, { weekStart });
const hm = (t: { hour: number; minute: number } | null) =>
  t === null ? null : `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
const brief = (s: ParsedSession) => ({ weekday: s.weekday, start: hm(s.start), end: hm(s.end) });
const one = (line: string) => {
  const r = parse(line);
  expect(r.sessions).toHaveLength(1);
  return r.sessions[0]!;
};

describe('real WhatsApp example 1 (CTI-01, CTI-02, CTI-14)', () => {
  const result = parse(WHATSAPP_EXAMPLE_1);

  it('CTI-01: four sessions — Mon 18:40–20:10, Wed 17:10–18:40, Thu 18:40–20:10, Fri 14:30–16:00', () => {
    expect(result.sessions.map(brief)).toEqual([
      { weekday: 1, start: '18:40', end: '20:10' },
      { weekday: 3, start: '17:10', end: '18:40' },
      { weekday: 4, start: '18:40', end: '20:10' },
      { weekday: 5, start: '14:30', end: '16:00' },
    ]);
  });

  it('CTI-02: "כל האימונים בעין כרמל" applies to all four sessions', () => {
    expect(result.messageLocation).toBe('עין כרמל');
    expect(result.sessions.map((s) => [s.location, s.locationSource])).toEqual(
      Array(4).fill(['עין כרמל', 'MESSAGE']),
    );
  });

  it('CTI-14: greetings, emoji and announcements create nothing and are not "not understood"', () => {
    expect(result.unparsed).toEqual([]);
    expect(result.sessions.every((s) => s.details === null)).toBe(true);
  });
});

describe('real WhatsApp example 2 (CTI-03, CTI-04)', () => {
  const result = parse(WHATSAPP_EXAMPLE_2);

  it('CTI-03: three sessions — Sun 15:00–16:30, Tue 16:30, Wed 14:10–15:40', () => {
    expect(result.sessions.map(brief)).toEqual([
      { weekday: 0, start: '15:00', end: '16:30' },
      { weekday: 2, start: '16:30', end: null },
      { weekday: 3, start: '14:10', end: '15:40' },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it('CTI-04: Tuesday keeps NO end time (never invented)', () => {
    expect(result.sessions[1]!.end).toBeNull();
  });

  it('Tuesday: details "משחק אימון נגד העומר", location עין כרמל from its own line, GAME suggested', () => {
    const tue = result.sessions[1]!;
    expect(tue.details).toBe('משחק אימון נגד העומר');
    expect(tue.location).toBe('עין כרמל');
    expect(tue.locationSource).toBe('LINE');
    expect(tue.suggestedType).toBe('GAME');
  });

  it('"אחרי בית ספר" stays details — not a title, not a location ("בית" is not "at ית")', () => {
    for (const s of [result.sessions[0]!, result.sessions[2]!]) {
      expect(s.details).toBe('אחרי בית ספר');
      expect(s.location).toBeNull();
      expect(s.suggestedType).toBeNull();
    }
    expect(result.messageLocation).toBeNull();
  });
});

describe('CTI-12 Hebrew weekday variants', () => {
  it.each([
    ['יום ראשון 18:00-19:00', 0],
    ['ראשון 18:00-19:00', 0],
    ['א׳ 18:00-19:00', 0],
    ["א' 18:00-19:00", 0],
    ['יום א׳ 18:00-19:00', 0],
    ['יום א 18:00-19:00', 0],
    ['ביום שני 18:00-19:00', 1],
    ['שני: 18:00-19:00', 1],
    ['ב׳ 18:00-19:00', 1],
    ['יום ב׳ 18:00-19:00', 1],
    ['יום שלישי 18:00-19:00', 2],
    ['ג׳ - 18:00-19:00', 2],
    ['רביעי 18:00-19:00', 3],
    ['ד׳ 18:00-19:00', 3],
    ['חמישי 18:00-19:00', 4],
    ['ה׳ 18:00-19:00', 4],
    ['יום שישי 10:00-11:00', 5],
    ['ו׳ 10:00-11:00', 5],
    ['שבת 10:00-11:00', 6],
    ['יום ש׳ 10:00-11:00', 6],
    ['- יום שני 18:00-19:00', 1],
  ])('%s → weekday %i', (line, weekday) => {
    expect(one(line).weekday).toBe(weekday);
  });

  it('several days on one line: "שני ורביעי", "ב׳, ד׳"', () => {
    expect(parse('שני ורביעי 18:00-19:30').sessions.map((s) => s.weekday)).toEqual([1, 3]);
    expect(parse('ב׳, ד׳ 17:00-18:00').sessions.map((s) => s.weekday)).toEqual([1, 3]);
    expect(parse('ימי שני ורביעי 17:00-18:00').sessions.map((s) => s.weekday)).toEqual([1, 3]);
  });

  it('a weekday word that is not a day is not a day', () => {
    // "שני אימונים" = two trainings; "ראשון" = first; "שבת שלום" has no time.
    expect(parse('שני אימונים ב 18:00').sessions).toEqual([]);
    expect(parse('שני אימונים ב 18:00').unparsed.map((u) => u.reason)).toEqual(['NO_DAY']);
    expect(parse('האימון הראשון ב 18:00').sessions).toEqual([]);
    expect(parse('שבת שלום').sessions).toEqual([]);
    expect(parse('שבת שלום').unparsed).toEqual([]);
    expect(parse('בשנים הבאות 18:00').sessions).toEqual([]);
  });

  it('a strong "יום X" wins over a bare word at the start of the line', () => {
    expect(parse('שני אימונים ביום רביעי 18:00-19:00').sessions.map((s) => s.weekday)).toEqual([3]);
  });

  it('"ב 16:30" is a preposition, never Monday (ב׳)', () => {
    expect(one('יום שלישי ב 16:30').weekday).toBe(2);
  });
});

describe('CTI-13 time variants', () => {
  it.each([
    ['יום שני 18:40-20:10', '18:40', '20:10'],
    ['יום שני 18:40 – 20:10', '18:40', '20:10'],
    ['יום שני 18:40 — 20:10', '18:40', '20:10'],
    ['יום שני 18:40 עד 20:10', '18:40', '20:10'],
    ['יום שני מ-18:40 עד 20:10', '18:40', '20:10'],
    ['יום שני מ18:40 עד 20:10', '18:40', '20:10'],
    ['יום שני משעה 18:40 עד השעה 20:10', '18:40', '20:10'],
    ['יום שני בשעה 18:40', '18:40', null],
    ['יום שני ב 18:40', '18:40', null],
    ['יום שני ב-18:40', '18:40', null],
    ['יום שני 8:30-10:00', '08:30', '10:00'],
  ])('%s', (line, start, end) => {
    const s = one(line);
    expect([hm(s.start), hm(s.end)]).toEqual([start, end]);
    expect(s.details).toBeNull();
  });

  it('two sessions on one day (two-a-day) stay two sessions', () => {
    expect(parse('יום שני 08:00-09:00 ו 18:00-19:30').sessions.map(brief)).toEqual([
      { weekday: 1, start: '08:00', end: '09:00' },
      { weekday: 1, start: '18:00', end: '19:30' },
    ]);
  });

  it('a malformed time creates nothing and is reported', () => {
    const r = parse('יום שני 25:00-26:00');
    expect(r.sessions).toEqual([]);
    expect(r.unparsed).toEqual([{ line: 1, text: 'יום שני 25:00-26:00', reason: 'INVALID_TIME' }]);
  });

  it('an end before the start is kept as written (review flags it, nothing is swapped)', () => {
    const s = one('יום שני 20:10-18:40');
    expect([hm(s.start), hm(s.end)]).toEqual(['20:10', '18:40']);
  });

  it('a time without a day is reported, not guessed', () => {
    const r = parse('האימון יתחיל ב 18:00');
    expect(r.sessions).toEqual([]);
    expect(r.unparsed.map((u) => u.reason)).toEqual(['NO_DAY']);
  });

  it('a day on one line and its time on the next line', () => {
    expect(parse('יום שני\n18:40-20:10').sessions.map(brief)).toEqual([{ weekday: 1, start: '18:40', end: '20:10' }]);
  });

  it('a day without a time is reported as not understood ("יום שלישי אין אימון")', () => {
    const r = parse('יום שלישי אין אימון');
    expect(r.sessions).toEqual([]);
    expect(r.unparsed.map((u) => u.reason)).toEqual(['NO_TIME']);
  });
});

describe('CTI-10 explicit dates (stronger than an inferred weekday)', () => {
  it.each(['14/10', '14.10', '14-10', '14/10/2026', '14/10/26', '14.10.2026'])('%s 18:00-19:30', (date) => {
    const s = one(`${date} 18:00-19:30`);
    expect(s.explicitDate).toEqual({ year: 2026, month: 10, day: 14 });
    expect(s.weekday).toBeNull();
  });

  it('a weekday next to a date is kept for the mismatch check; the date wins', () => {
    const s = one('יום שני 14/10 18:00-19:30');
    expect(s.explicitDate).toEqual({ year: 2026, month: 10, day: 14 });
    expect(s.weekday).toBe(1);
  });

  it('a date with no year takes the year nearest to the chosen week (December → January)', () => {
    const s = parseSchedule('2/1 18:00-19:00', { weekStart: calendarDate(2026, 12, 27)! }).sessions[0]!;
    expect(s.explicitDate).toEqual({ year: 2027, month: 1, day: 2 });
  });

  it('CTI-11 (parser part): a date outside the week is kept as written, never moved', () => {
    expect(one('21/10 18:00-19:00').explicitDate).toEqual({ year: 2026, month: 10, day: 21 });
  });

  it('a time range is never read as a date ("18:40-20:10" has no "40-20")', () => {
    expect(one('יום שני 18:40-20:10').explicitDate).toBeNull();
  });

  it('an impossible date is not a date', () => {
    expect(parse('31/2 18:00-19:00').sessions).toEqual([]);
  });
});

describe('locations', () => {
  it('"מיקום:" and "📍" lines give every session a location', () => {
    expect(parse('מיקום: אולם הספורט\nיום שני 18:00-19:00').sessions[0]!.location).toBe('אולם הספורט');
    expect(parse('📍 אולם הספורט\nיום שני 18:00-19:00').sessions[0]!.location).toBe('אולם הספורט');
    expect(parse('האימונים יתקיימו בעין כרמל\nיום שני 18:00-19:00').sessions[0]!.location).toBe('עין כרמל');
  });

  it("a session's own place overrides the message-wide one", () => {
    const r = parse('יום שני 18:00-19:00\nיום רביעי משחק בחיפה ב 17:00\nכל האימונים בעין כרמל');
    expect(r.sessions.map((s) => [s.location, s.locationSource])).toEqual([
      ['עין כרמל', 'MESSAGE'],
      ['חיפה', 'LINE'],
    ]);
  });

  it('"ב <place>" and "ב-<place>" forms', () => {
    expect(one('יום שני 18:00-19:00 ב-עין כרמל').location).toBe('עין כרמל');
    expect(one('יום שני 18:00-19:00 ב אולם 2').location).toBe('אולם 2');
  });
});

describe('normalization and noise (CTI-14)', () => {
  it('direction marks, CRLF and emoji inside a schedule line do not matter', () => {
    const text = '‏יום שני‏ 🏀 18:40-20:10\r\nיום רביעי 💪🏽 17:10-18:40';
    expect(parse(text).sessions.map(brief)).toEqual([
      { weekday: 1, start: '18:40', end: '20:10' },
      { weekday: 3, start: '17:10', end: '18:40' },
    ]);
  });

  it('a message with no schedule produces nothing at all', () => {
    expect(parse('חבר׳ה שבוע טוב 🤩\nמחכה לראות אתכם 💪🏽💙\nבשורות טובות אמן.')).toEqual({
      sessions: [],
      unparsed: [],
      messageLocation: null,
    });
  });

  it('keys follow message order and are stable', () => {
    expect(parse(WHATSAPP_EXAMPLE_1).sessions.map((s) => s.key)).toEqual(['s1', 's2', 's3', 's4']);
    expect(parse(WHATSAPP_EXAMPLE_1)).toEqual(parse(WHATSAPP_EXAMPLE_1));
  });

  it('is fast for a WhatsApp-sized message', () => {
    const big = Array(50).fill(WHATSAPP_EXAMPLE_1).join('\n');
    const t0 = Date.now();
    expect(parse(big).sessions).toHaveLength(200);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
