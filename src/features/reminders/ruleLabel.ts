import { beforeStartParts, type ReminderRule } from '@/domain/reminders';
import { ltr } from '@/i18n/bidi';
import type { TranslationKey } from '@/i18n/types';

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;
const pad = (n: number) => String(n).padStart(2, '0');

/** One rule in words: "At the start of the event" · "08:00 on the event day" · "2 hours before". */
export function ruleLabel(t: T, rule: ReminderRule): string {
  if (rule.kind === 'AT_START') return t('reminders.rule.atStart');
  if (rule.kind === 'DAY_OF_AT') return t('reminders.rule.dayOfAt', { time: ltr(`${pad(rule.hour)}:${pad(rule.minute)}`) });
  const { value, unit } = beforeStartParts(rule.minutes);
  const key = `reminders.rule.before${unit === 'MINUTES' ? 'Minutes' : unit === 'HOURS' ? 'Hours' : 'Days'}${value === 1 ? 'One' : ''}`;
  return t(key as TranslationKey, { value });
}

/** A rule list in one line ("No reminders" when it is empty). */
export function rulesSummary(t: T, rules: readonly ReminderRule[]): string {
  return rules.length === 0 ? t('reminders.summary.none') : rules.map((r) => ruleLabel(t, r)).join(' · ');
}
