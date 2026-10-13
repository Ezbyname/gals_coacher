import { addRule, beforeStartParts, beforeStartRule, DEFAULT_REMINDER_RULES, removeRule, replaceRule, togglePlayer, type ReminderRule } from '..';

/** CAL-SYNC-NOTIFY-001B — editing the reminder rules keeps the 001A invariants (0–5, no duplicate). */
const before = (minutes: number): ReminderRule => ({ kind: 'BEFORE_START', minutes });

describe('reminder rule editor', () => {
  it('BEFORE_START value + unit → minutes; whole positive numbers; at most one week', () => {
    expect(beforeStartRule('45', 'MINUTES')).toEqual({ ok: true, rule: before(45) });
    expect(beforeStartRule(' 2 ', 'HOURS')).toEqual({ ok: true, rule: before(120) });
    expect(beforeStartRule('7', 'DAYS')).toEqual({ ok: true, rule: before(7 * 24 * 60) });
    expect(beforeStartRule('8', 'DAYS')).toEqual({ ok: false, error: 'TOO_LONG' });
    for (const bad of ['', '0', '-5', '1.5', 'abc', '١٢']) expect(beforeStartRule(bad, 'MINUTES')).toEqual({ ok: false, error: 'INVALID' });
  });

  it('a rule is shown in its largest whole unit', () => {
    expect(beforeStartParts(30)).toEqual({ value: 30, unit: 'MINUTES' });
    expect(beforeStartParts(120)).toEqual({ value: 2, unit: 'HOURS' });
    expect(beforeStartParts(90)).toEqual({ value: 90, unit: 'MINUTES' });
    expect(beforeStartParts(2880)).toEqual({ value: 2, unit: 'DAYS' });
  });

  it('add: at the end; a duplicate is refused; at most 5; nothing changes on refusal', () => {
    const three = DEFAULT_REMINDER_RULES;
    expect(addRule(three, before(45))).toEqual({ ok: true, rules: [...three, before(45)] });
    expect(addRule(three, before(30))).toEqual({ ok: false, error: 'DUPLICATE' });
    expect(addRule(three, { kind: 'DAY_OF_AT', hour: 8, minute: 0 })).toEqual({ ok: false, error: 'DUPLICATE' });
    const five = [...three, before(45), before(10)];
    expect(addRule(five, before(5))).toEqual({ ok: false, error: 'TOO_MANY' });
    expect(addRule([], before(5))).toEqual({ ok: true, rules: [before(5)] }); // from 0 rules
  });

  it('edit: in place; may keep its own value; identical to ANOTHER rule → refused', () => {
    const rules = DEFAULT_REMINDER_RULES;
    expect(replaceRule(rules, 1, before(180))).toEqual({ ok: true, rules: [rules[0], before(180), rules[2]] });
    expect(replaceRule(rules, 1, before(120))).toEqual({ ok: true, rules });
    expect(replaceRule(rules, 1, before(30))).toEqual({ ok: false, error: 'DUPLICATE' });
    expect(replaceRule(rules, 9, before(5))).toEqual({ ok: false, error: 'INVALID' });
  });

  it('remove down to 0 rules (0 = no reminders)', () => {
    let rules: readonly ReminderRule[] = DEFAULT_REMINDER_RULES;
    rules = removeRule(rules, 1);
    expect(rules).toEqual([DEFAULT_REMINDER_RULES[0], DEFAULT_REMINDER_RULES[2]]);
    expect(removeRule(removeRule(rules, 0), 0)).toEqual([]);
  });

  it('Players: only the one tapped is added / removed — never "all"', () => {
    const prefs = { enabled: true, rules: DEFAULT_REMINDER_RULES, players: ['a'] };
    expect(togglePlayer(prefs, 'b').players).toEqual(['a', 'b']);
    expect(togglePlayer(prefs, 'a').players).toEqual([]);
  });
});
