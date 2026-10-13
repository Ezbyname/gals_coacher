import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  findHeader,
  findTeam,
  fixtureTeams,
  readFixtures,
  readWorkbook,
  sameTeam,
  XlsxReadError,
  type FixtureColumn,
  type FixtureRow,
  type RejectedRow,
  type SourceTeam,
  type Workbook,
} from '@/domain/scheduleImport';
import { isolate } from '@/i18n/bidi';
import { useI18n } from '@/i18n/I18nProvider';
import { BigButton } from '@/ui/BigButton';
import { ChoiceChips } from '@/ui/ChoiceChips';
import { colors, spacing } from '@/ui/theme';

import { pickSpreadsheet } from './pickSpreadsheet';

/**
 * CAL-SCHEDULE-IMPORT-002B — the Excel source of the import screen: choose a
 * fixture file (system picker, read locally), its sheet when there are several,
 * and the Player's TEAM. The Player is never inferred from the file: it is the
 * route's Player. The team is preselected only on an EXACT normalized match
 * with the Player's Team Name; otherwise the user chooses from the file's
 * teams. Saving the chosen team to the Player is optional and explicit.
 */
export interface ExcelSelection {
  /** null when the picker did not give a real file name (shown as "Excel file"). */
  readonly fileName: string | null;
  readonly fixtures: readonly FixtureRow[];
  readonly rejected: readonly RejectedRow[];
  readonly teams: readonly SourceTeam[];
  readonly team: SourceTeam | null;
  /** The user asked to save the chosen team as the Player's Team Name. */
  readonly saveTeam: boolean;
}

type ExcelError = { kind: 'NOT_A_WORKBOOK' | 'NO_SHEETS' | 'NO_FIXTURES' } | { kind: 'MISSING_COLUMNS'; columns: FixtureColumn[] };

export function ExcelSourcePanel({
  playerName,
  playerTeam,
  value,
  onChange,
  teamError,
}: {
  playerName: string;
  playerTeam: string | null;
  value: ExcelSelection | null;
  onChange: (value: ExcelSelection | null) => void;
  teamError: boolean;
}) {
  const { t } = useI18n();
  const [workbook, setWorkbook] = useState<{ name: string | null; wb: Workbook } | null>(null);
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const [error, setError] = useState<ExcelError | null>(null);
  const name = isolate(playerName);

  const applySheet = (name: string | null, wb: Workbook, index: number) => {
    setSheetIndex(index);
    const sheet = wb.sheets[index]!;
    const header = findHeader(sheet);
    if (!header.ok) {
      setError({ kind: 'MISSING_COLUMNS', columns: [...header.missing] });
      return onChange(null);
    }
    const { fixtures, rejected } = readFixtures(sheet, header, wb.date1904);
    if (fixtures.length === 0) {
      setError({ kind: 'NO_FIXTURES' });
      return onChange(null);
    }
    setError(null);
    const teams = fixtureTeams(fixtures);
    const match = playerTeam === null ? null : findTeam(playerTeam, teams);
    onChange({ fileName: name, fixtures, rejected, teams, team: match?.kind === 'EXACT' ? match.team : null, saveTeam: false });
  };

  const choose = async () => {
    try {
      const picked = await pickSpreadsheet();
      if (picked === null) return; // cancelled: nothing changes
      const wb = readWorkbook(picked.bytes);
      setWorkbook({ name: picked.name, wb });
      if (wb.sheets.length === 1) applySheet(picked.name, wb, 0);
      else {
        setSheetIndex(null);
        onChange(null);
      }
    } catch (e) {
      console.warn('[scheduleImport] could not read the spreadsheet', e);
      setWorkbook(null);
      setError({ kind: e instanceof XlsxReadError && e.reason === 'NO_SHEETS' ? 'NO_SHEETS' : 'NOT_A_WORKBOOK' });
      onChange(null);
    }
  };

  const matched = value !== null && value.team !== null && playerTeam !== null && sameTeam(value.team.name, playerTeam);
  return (
    <View style={styles.group}>
      <BigButton testID="import-excel-pick" variant="secondary" label={t('calendarImport.excel.pick')} onPress={() => void choose()} />
      {error !== null ? (
        <Text style={styles.error} testID="import-excel-error">
          {error.kind === 'MISSING_COLUMNS'
            ? t('calendarImport.excel.missingColumns', {
                columns: error.columns.map((c) => t(`calendarImport.excel.column.${c as 'date' | 'time' | 'home' | 'away'}`)).join(', '),
              })
            : t(`calendarImport.excel.error.${error.kind}`)}
        </Text>
      ) : null}
      {workbook !== null && workbook.wb.sheets.length > 1 ? (
        <ChoiceChips<string>
          testID="import-excel-sheet"
          label={t('calendarImport.excel.sheet')}
          choices={workbook.wb.sheets.map((s, i) => ({ value: String(i), label: s.name }))}
          value={sheetIndex === null ? null : String(sheetIndex)}
          onChange={(v) => v !== null && applySheet(workbook.name, workbook.wb, Number(v))}
        />
      ) : null}
      {value !== null ? (
        <>
          <Text style={styles.muted} testID="import-excel-file">
            {t('calendarImport.excel.file', {
              name: isolate(value.fileName ?? t('calendarImport.source.excel')),
              count: value.fixtures.length,
            })}
          </Text>
          <ChoiceChips<string>
            testID="import-excel-team"
            label={t('calendarImport.excel.team', { name })}
            choices={value.teams.map((team, i) => ({ value: String(i), label: team.name }))}
            value={value.team === null ? null : String(value.teams.indexOf(value.team))}
            onChange={(v) => v !== null && onChange({ ...value, team: value.teams[Number(v)] ?? null, saveTeam: false })}
            error={teamError ? t('calendarImport.excel.teamRequired', { name }) : undefined}
          />
          <Text style={styles.muted} testID="import-excel-team-hint">
            {matched ? t('calendarImport.excel.teamMatched') : t('calendarImport.excel.teamChoose', { name })}
          </Text>
          {value.team !== null && !matched ? (
            <ChoiceChips<'save'>
              testID="import-excel-save-team"
              label={t('calendarImport.excel.saveTeamLabel')}
              choices={[{ value: 'save', label: t('calendarImport.excel.saveTeam', { team: isolate(value.team.name), name }) }]}
              value={value.saveTeam ? 'save' : null}
              onChange={(v) => onChange({ ...value, saveTeam: v === 'save' })}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
});
