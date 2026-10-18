import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import {
  addRule,
  BEFORE_UNITS,
  beforeStartParts,
  beforeStartRule,
  MAX_REMINDER_RULES,
  removeRule,
  replaceRule,
  type BeforeUnit,
  type ReminderRule,
  type RuleEditError,
} from '@/domain/reminders';
import { ltr, stripBidi } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import type { LocalDateTime } from '@/services/clock/localCalendarDate';
import { BigButton } from '@/ui/BigButton';
import { Card } from '@/ui/Card';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { DateTimeField } from '@/ui/DateTimeField';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

import { ruleLabel } from './ruleLabel';

/**
 * One reminder rule list (0–5 rules, no duplicates; a refused edit changes nothing): the rows, the add / edit editor
 * (At start · a time on the event day · before the start) and the limit note. Used for the GENERAL list, a TYPE default
 * and one EVENT's own reminders; every use keeps the same test ids under its own `prefix`.
 */
type Editor = {
  readonly index: number | null; // null = a new rule
  readonly kind: ReminderRule['kind'];
  readonly time: { readonly hour: number; readonly minute: number };
  readonly value: string;
  readonly unit: BeforeUnit;
};
const NEW_EDITOR: Editor = { index: null, kind: 'BEFORE_START', time: { hour: 8, minute: 0 }, value: '60', unit: 'MINUTES' };
const pad = (n: number) => String(n).padStart(2, '0');

export function RuleListEditor({ rules, onChange, prefix }: { rules: readonly ReminderRule[]; onChange: (rules: readonly ReminderRule[]) => void; prefix: string }) {
  const { t } = useI18n();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editError, setEditError] = useState<RuleEditError | null>(null);

  const openEditor = (index: number | null) => {
    setEditError(null);
    if (index === null) return setEditor(NEW_EDITOR);
    const rule = rules[index]!;
    setEditor(
      rule.kind === 'AT_START'
        ? { ...NEW_EDITOR, index, kind: 'AT_START' }
        : rule.kind === 'DAY_OF_AT'
          ? { ...NEW_EDITOR, index, kind: 'DAY_OF_AT', time: { hour: rule.hour, minute: rule.minute } }
          : { ...NEW_EDITOR, index, kind: 'BEFORE_START', value: String(beforeStartParts(rule.minutes).value), unit: beforeStartParts(rule.minutes).unit },
    );
  };
  const saveEditor = () => {
    if (editor === null) return;
    let rule: ReminderRule;
    if (editor.kind === 'AT_START') rule = { kind: 'AT_START' };
    else if (editor.kind === 'DAY_OF_AT') rule = { kind: 'DAY_OF_AT', hour: editor.time.hour, minute: editor.time.minute };
    else {
      const built = beforeStartRule(editor.value, editor.unit);
      if (!built.ok) return setEditError(built.error);
      rule = built.rule;
    }
    const result = editor.index === null ? addRule(rules, rule) : replaceRule(rules, editor.index, rule);
    if (!result.ok) return setEditError(result.error);
    onChange(result.rules);
    setEditor(null);
  };

  const timeValue: LocalDateTime | null = editor === null ? null : { year: 2026, month: 1, day: 1, ...editor.time };
  return (
    <>
      {rules.length === 0 ? (
        <Text style={styles.muted} testID={`${prefix}-rules-none`}>
          {t('reminders.noRules')}
        </Text>
      ) : null}
      {rules.map((rule, i) => {
        const text = ruleLabel(t, rule);
        return (
          <Card key={`${rule.kind}-${i}`} testID={`${prefix}-rule-${i}`} style={styles.ruleRow}>
            <Text style={[styles.body, styles.flex]} testID={`${prefix}-rule-${i}-text`}>
              {text}
            </Text>
            <RowAction testID={`${prefix}-rule-${i}-edit`} label={t('reminders.edit')} a11y={t('reminders.editA11y', { rule: text })} onPress={() => openEditor(i)} />
            <RowAction testID={`${prefix}-rule-${i}-remove`} label={t('reminders.remove')} a11y={t('reminders.removeA11y', { rule: text })} onPress={() => onChange(removeRule(rules, i))} />
          </Card>
        );
      })}

      {editor !== null ? (
        <Card testID={`${prefix}-editor`} style={styles.gap}>
          <ChoiceChips<ReminderRule['kind']>
            testID={`${prefix}-editor-kind`}
            label={t('reminders.editor.kind')}
            choices={[
              { value: 'AT_START', label: t('reminders.editor.atStart') },
              { value: 'DAY_OF_AT', label: t('reminders.editor.dayOfAt') },
              { value: 'BEFORE_START', label: t('reminders.editor.beforeStart') },
            ]}
            value={editor.kind}
            onChange={(kind) => kind !== null && setEditor({ ...editor, kind })}
          />
          {editor.kind === 'DAY_OF_AT' && timeValue !== null ? (
            <DateTimeField
              testID={`${prefix}-editor-time`}
              label={t('reminders.editor.time')}
              mode="time"
              value={timeValue}
              displayValue={ltr(`${pad(editor.time.hour)}:${pad(editor.time.minute)}`)}
              onSelect={(v) => setEditor({ ...editor, time: { hour: v.hour, minute: v.minute } })}
            />
          ) : editor.kind === 'BEFORE_START' ? (
            <>
              <TextField
                testID={`${prefix}-editor-value`}
                label={t('reminders.editor.value')}
                value={editor.value}
                onChangeText={(value) => setEditor({ ...editor, value })}
                numeric
                keyboardType="number-pad"
                maxLength={5}
              />
              <ChoiceChips<BeforeUnit>
                testID={`${prefix}-editor-unit`}
                label={t('reminders.editor.unit')}
                choices={BEFORE_UNITS.map((u) => ({ value: u, label: t(`reminders.editor.units.${u}`) }))}
                value={editor.unit}
                onChange={(unit) => unit !== null && setEditor({ ...editor, unit })}
              />
            </>
          ) : null}
          {editError !== null ? (
            <Text style={styles.error} testID={`${prefix}-editor-error`}>
              {t(`reminders.editor.errors.${editError}`, { max: MAX_REMINDER_RULES })}
            </Text>
          ) : null}
          <BigButton testID={`${prefix}-editor-save`} label={t('reminders.editor.save')} onPress={saveEditor} />
          <BigButton testID={`${prefix}-editor-cancel`} variant="secondary" label={t('common.cancel')} onPress={() => setEditor(null)} />
        </Card>
      ) : (
        <BigButton testID={`${prefix}-add`} variant="secondary" label={t('reminders.add')} disabled={rules.length >= MAX_REMINDER_RULES} onPress={() => openEditor(null)} />
      )}
      {editor === null && rules.length >= MAX_REMINDER_RULES ? (
        <Text style={styles.muted} testID={`${prefix}-max`}>
          {t('reminders.max', { max: MAX_REMINDER_RULES })}
        </Text>
      ) : null}
    </>
  );
}

function RowAction({ testID, label, a11y, onPress }: { testID: string; label: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={stripBidi(a11y)} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  gap: { gap: spacing.sm },
  body: { fontSize: 16, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  action: { minHeight: touch.buttonMinHeight, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.court },
});
