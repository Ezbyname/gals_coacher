import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  findHeader,
  findTeam,
  fixtureTeams,
  normalizeTeamName,
  readFixtures,
  readWorkbook,
  sameTeam,
  sideOf,
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
import { KeyboardSafeScrollView } from '@/ui/KeyboardSafeScrollView';
import { TextField } from '@/ui/TextField';
import { colors, spacing, touch } from '@/ui/theme';

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

/**
 * The fixtures of a source (an Excel sheet or a pasted season list, 002C) as a
 * selection: its teams, and the Player's team PRESELECTED only on an exact
 * normalized match with the Player's Team Name (never "contains", never inferred).
 */
export function fixtureSelection(
  fileName: string | null,
  fixtures: readonly FixtureRow[],
  rejected: readonly RejectedRow[],
  playerTeam: string | null,
): ExcelSelection {
  const teams = fixtureTeams(fixtures);
  const match = playerTeam === null ? null : findTeam(playerTeam, teams);
  return { fileName, fixtures, rejected, teams, team: match?.kind === 'EXACT' ? match.team : null, saveTeam: false };
}

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
    onChange(fixtureSelection(name, fixtures, rejected, playerTeam));
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
          <TeamChooser
            idPrefix="import-excel"
            playerName={playerName}
            playerTeam={playerTeam}
            value={value}
            onChange={onChange}
            teamError={teamError}
          />
        </>
      ) : null}
    </View>
  );
}

/**
 * "Which team is the Player's?" — shared by the Excel file and the pasted season
 * list (002C). The import screen stays compact (owner UX correction 2026-10-14):
 * an exact Team Name match shows ONLY that team (+ its game count, "Change team");
 * otherwise a short summary and "Choose team". The detected teams appear only in
 * the picker (search, one selection). Saving the choice as the Player's Team Name
 * is explicit and unchecked by default. The Player is never inferred from the source,
 * and the Player profile is never filled with the detected teams.
 */
export function TeamChooser({
  idPrefix,
  playerName,
  playerTeam,
  value,
  onChange,
  teamError,
}: {
  idPrefix: 'import-excel' | 'import-fixture';
  playerName: string;
  playerTeam: string | null;
  value: ExcelSelection;
  onChange: (value: ExcelSelection) => void;
  teamError: boolean;
}) {
  const { t } = useI18n();
  const [picking, setPicking] = useState(false);
  const name = isolate(playerName);
  const games = value.team === null ? 0 : value.fixtures.filter((f) => sideOf(value.team!, f.home, f.away) !== null).length;
  return (
    <View style={styles.group}>
      {value.team !== null ? (
        <View style={styles.gap}>
          <Text style={styles.label}>{t('calendarImport.excel.yourTeam')}</Text>
          <Text style={styles.team} testID={`${idPrefix}-team-selected`}>
            {selectedLabel(value.team.name)}
          </Text>
          <Text style={styles.muted} testID={`${idPrefix}-team-games`}>
            {t('calendarImport.excel.teamGames', { count: games })}
          </Text>
          <BigButton testID={`${idPrefix}-team-change`} variant="secondary" label={t('calendarImport.excel.changeTeam')}
            onPress={() => setPicking(true)} />
        </View>
      ) : (
        <View style={styles.gap}>
          <Text style={styles.muted} testID={`${idPrefix}-teams-count`}>
            {t('calendarImport.excel.teamsDetected', { count: value.teams.length })}
          </Text>
          {playerTeam !== null ? (
            <Text style={styles.body} testID={`${idPrefix}-team-saved-mismatch`}>
              {t('calendarImport.excel.savedTeamNoMatch', { team: isolate(playerTeam) })}
            </Text>
          ) : (
            <Text style={styles.body} testID={`${idPrefix}-team-unknown`}>
              {t('calendarImport.excel.teamUnknown')}
            </Text>
          )}
          <BigButton testID={`${idPrefix}-team-choose`} label={t('calendarImport.excel.chooseTeam')} onPress={() => setPicking(true)} />
          {teamError ? (
            <Text style={styles.error} testID={`${idPrefix}-team-error`}>
              {t('calendarImport.excel.teamRequired', { name })}
            </Text>
          ) : null}
        </View>
      )}
      {picking ? (
        <TeamPicker
          idPrefix={idPrefix}
          teams={value.teams}
          initial={value.team}
          playerTeam={playerTeam}
          onCancel={() => setPicking(false)}
          onConfirm={(team, saveTeam) => {
            setPicking(false);
            onChange({ ...value, team, saveTeam });
          }}
        />
      ) : null}
    </View>
  );
}

// Visual markers (not words), kept out of JSX literals.
const selectedLabel = (team: string) => `${isolate(team)} ✓`;
const optionLabel = (team: string, selected: boolean) => `${selected ? '◉' : '○'}  ${team}`;
const checkboxLabel = (label: string, checked: boolean) => `${checked ? '☑' : '☐'}  ${label}`;

/** The detected teams of THIS import only: search, one selection, optional explicit save. */
function TeamPicker({
  idPrefix,
  teams,
  initial,
  playerTeam,
  onCancel,
  onConfirm,
}: {
  idPrefix: string;
  teams: readonly SourceTeam[];
  initial: SourceTeam | null;
  playerTeam: string | null;
  onCancel: () => void;
  onConfirm: (team: SourceTeam, saveTeam: boolean) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<SourceTeam | null>(initial);
  const [save, setSave] = useState(false); // unchecked by default (owner)
  const shown = useMemo(() => {
    const q = normalizeTeamName(query);
    return teams.map((team, index) => ({ team, index })).filter(({ team }) => q === '' || normalizeTeamName(team.name).includes(q));
  }, [teams, query]);
  // Offered only when the choice is not already the Player's saved Team Name.
  const canSave = chosen !== null && (playerTeam === null || !sameTeam(chosen.name, playerTeam));
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} testID={`${idPrefix}-team-picker`}>
      <KeyboardSafeScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled" testID={`${idPrefix}-team-picker-scroll`}>
        <Text style={styles.heading} accessibilityRole="header">
          {t('calendarImport.excel.pickerTitle')}
        </Text>
        <TextField testID={`${idPrefix}-team-search`} label={t('calendarImport.excel.search')} value={query} onChangeText={setQuery} />
        <View accessibilityRole="radiogroup" style={styles.gap}>
          {shown.map(({ team, index }) => {
            const selected = chosen === team;
            return (
              <Pressable
                key={index}
                testID={`${idPrefix}-team-option-${index}`}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={team.name}
                onPress={() => {
                  setChosen(team);
                  setSave(false);
                }}
                style={[styles.option, selected && styles.optionSelected]}>
                <Text style={styles.body} testID={`${idPrefix}-team-option-${index}-label`}>
                  {optionLabel(team.name, selected)}
                </Text>
              </Pressable>
            );
          })}
          {shown.length === 0 ? (
            <Text style={styles.muted} testID={`${idPrefix}-team-no-results`}>
              {t('calendarImport.excel.noResults')}
            </Text>
          ) : null}
        </View>
        {canSave ? (
          <Pressable
            testID={`${idPrefix}-team-save`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: save }}
            onPress={() => setSave(!save)}
            style={styles.option}>
            <Text style={styles.body}>{checkboxLabel(t('calendarImport.excel.saveAsMine'), save)}</Text>
          </Pressable>
        ) : null}
        <BigButton testID={`${idPrefix}-team-confirm`} label={t('calendarImport.excel.confirm')} disabled={chosen === null}
          onPress={() => chosen !== null && onConfirm(chosen, canSave && save)} />
        <BigButton testID={`${idPrefix}-team-cancel`} variant="secondary" label={t('common.cancel')} onPress={onCancel} />
      </KeyboardSafeScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  gap: { gap: spacing.sm },
  sheet: { padding: spacing.lg, gap: spacing.md },
  heading: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'auto' },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink, textAlign: 'auto' },
  team: { fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'auto' },
  body: { fontSize: 16, color: colors.ink, textAlign: 'auto' },
  muted: { fontSize: 14, color: colors.inkMuted, textAlign: 'auto' },
  error: { fontSize: 15, color: colors.danger, fontWeight: '600', textAlign: 'auto' },
  option: { minHeight: touch.buttonMinHeight, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  optionSelected: { borderColor: colors.court, borderWidth: 2 },
});
