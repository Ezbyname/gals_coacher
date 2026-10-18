import { StyleSheet, Text, View } from 'react-native';

import { inheritedRules, type ReminderPreferences, type ReminderRule } from '@/domain/reminders';
import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { Card } from '@/ui/Card';
import { colors, spacing } from '@/ui/theme';

import { RuleListEditor } from './RuleListEditor';
import { rulesSummary } from './ruleLabel';

/**
 * One event's own reminders (CAL-REMINDER-RULES-002). `value` null = the event inherits (its type's reminders, else the
 * general ones); a list — even an empty one — is the event's own and replaces them. Nothing is written here: the form
 * saves the value after the event itself.
 */
export function EventRemindersField({
  prefs,
  typeId,
  value,
  onChange,
}: {
  prefs: ReminderPreferences;
  typeId: string | null;
  value: readonly ReminderRule[] | null;
  onChange: (rules: readonly ReminderRule[] | null) => void;
}) {
  const { t } = useI18n();
  const inherited = inheritedRules(prefs, typeId).rules;
  const fromType = typeId !== null && prefs.typeRules[typeId] !== undefined;
  return (
    <Card testID="event-reminders" style={styles.gap}>
      <Text style={styles.heading} accessibilityRole="header">
        {t('reminders.event.title')}
      </Text>
      {!prefs.enabled ? (
        <Text style={styles.muted} testID="event-reminders-off">
          {t('reminders.event.off')}
        </Text>
      ) : null}
      {value === null ? (
        <>
          <Text style={styles.body} testID="event-reminders-summary">
            {t(fromType ? 'reminders.event.fromType' : 'reminders.event.fromGeneral', { rules: rulesSummary(t, inherited) })}
          </Text>
          <BigButton testID="event-reminders-customize" variant="secondary" label={t('reminders.event.customize')} onPress={() => onChange(inherited)} />
        </>
      ) : (
        <View style={styles.gap}>
          <RuleListEditor prefix="event-reminders" rules={value} onChange={onChange} />
          {value.length > 0 ? <BigButton testID="event-reminders-none" variant="secondary" label={t('reminders.event.none')} onPress={() => onChange([])} /> : null}
          <BigButton testID="event-reminders-default" variant="secondary" label={t('reminders.event.useDefault')} onPress={() => onChange(null)} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  heading: { fontSize: 16, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  body: { fontSize: 15, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
});
