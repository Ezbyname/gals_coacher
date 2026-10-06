import { BUILTIN_EXERCISES, builtinExercise } from '../catalog';
import { doableWith, needsNoEquipment, type EquipmentOption } from '../equipment';
import {
  EXERCISE_NAME_MAX_LENGTH,
  NO_EXERCISE_FILTER,
  bodyAreasOf,
  filterExercises,
  searchKey,
  validateCustomExercise,
  type CustomExerciseInput,
  type Exercise,
  type ExerciseFilter,
} from '../exercise';

const library: Exercise[] = BUILTIN_EXERCISES.map((d) => ({ ...d, builtin: true, active: true }));
const ids = (filter: Partial<ExerciseFilter>, list: Exercise[] = library, language: 'he' | 'en' = 'en') =>
  filterExercises(list, { ...NO_EXERCISE_FILTER, ...filter }, language).map((e) => e.id);

describe('equipment requirements: options are alternatives; items inside an option are all needed', () => {
  const goblet: EquipmentOption[] = [['KETTLEBELL'], ['DUMBBELL']];
  const bench: EquipmentOption[] = [['BARBELL', 'BENCH', 'SQUAT_RACK']];

  it('alternatives: either piece is enough — never both', () => {
    expect(doableWith(goblet, ['DUMBBELL'])).toBe(true);
    expect(doableWith(goblet, ['KETTLEBELL'])).toBe(true);
    expect(doableWith(goblet, ['BARBELL'])).toBe(false);
  });

  it('a combination needs every item', () => {
    expect(doableWith(bench, ['BARBELL', 'BENCH'])).toBe(false);
    expect(doableWith(bench, ['BARBELL', 'BENCH', 'SQUAT_RACK', 'DUMBBELL'])).toBe(true);
  });

  it('no option (or an empty option) = bodyweight: doable with nothing', () => {
    expect(needsNoEquipment([])).toBe(true);
    expect(doableWith([], [])).toBe(true);
    expect(needsNoEquipment(goblet)).toBe(false);
  });
});

describe('library filters (AND across dimensions, OR inside one)', () => {
  it('default: every active exercise', () => {
    expect(ids({})).toHaveLength(library.length);
  });

  it('“no equipment” shows only bodyweight exercises', () => {
    const found = ids({ bodyweightOnly: true });
    expect(found).toContain('PUSH_UP');
    expect(found).toContain('PLANK');
    expect(found).not.toContain('GOBLET_SQUAT');
    expect(found).not.toContain('FREE_THROWS');
    expect(found.every((id) => needsNoEquipment(builtinExercise(id)!.equipment))).toBe(true);
  });

  it('“I have…”: a home kit of dumbbells + band finds dumbbell and band work plus bodyweight — no barbell', () => {
    const found = ids({ available: ['DUMBBELL', 'RESISTANCE_BAND'] });
    for (const id of [
      'GOBLET_SQUAT',
      'BAND_ROW',
      'PUSH_UP',
      'DUMBBELL_SHOULDER_PRESS',
      'ROMANIAN_DEADLIFT',
    ]) {
      expect(found).toContain(id);
    }
    for (const id of ['BARBELL_BACK_SQUAT', 'PULL_UP', 'FREE_THROWS', 'DUMBBELL_BENCH_PRESS']) {
      expect(found).not.toContain(id); // DB bench press also needs a bench
    }
  });

  it('a basketball court kit finds the basketball drills', () => {
    const found = ids({
      available: ['BASKETBALL', 'BASKETBALL_HOOP', 'CONES', 'RUNNING_AREA'],
      sports: ['BASKETBALL'],
    });
    expect(found).toEqual(
      expect.arrayContaining(['FREE_THROWS', 'LAYUPS', 'CONE_DRIBBLE_SLALOM', 'DEFENSIVE_SLIDES']),
    );
  });

  it('difficulty, category, muscle (primary or secondary), body area and sport', () => {
    expect(
      ids({ difficulties: ['ADVANCED'] }).every((id) => builtinExercise(id)!.difficulty === 'ADVANCED'),
    ).toBe(true);
    expect(ids({ categories: ['PLYOMETRIC'] })).toContain('BOX_JUMP');
    expect(ids({ muscles: ['FOREARMS_GRIP'] })).toContain('ROMANIAN_DEADLIFT'); // a secondary muscle
    expect(ids({ areas: ['POSTERIOR_CHAIN'] })).toContain('KETTLEBELL_SWING');
    expect(
      ids({ sports: ['BASKETBALL'] }).every((id) => builtinExercise(id)!.sports.includes('BASKETBALL')),
    ).toBe(true);
    // OR inside, AND across.
    const both = ids({ categories: ['CORE', 'PLYOMETRIC'], difficulties: ['BEGINNER'] });
    expect(both).toEqual(expect.arrayContaining(['PLANK', 'POGO_JUMPS']));
    expect(both).not.toContain('HOLLOW_HOLD'); // core but intermediate
  });

  it('search matches Hebrew and English names, case- and spacing-insensitive', () => {
    expect(ids({ query: '  romanian   DEADLIFT ' })).toEqual(['ROMANIAN_DEADLIFT', 'SINGLE_LEG_RDL']);
    expect(ids({ query: 'goblet' })).toEqual(['GOBLET_SQUAT']);
    expect(ids({ query: 'דדליפט רומני' }, library, 'he')).toEqual(
      expect.arrayContaining(['ROMANIAN_DEADLIFT', 'SINGLE_LEG_RDL']),
    );
    expect(searchKey('Ａ  B')).toBe('a b');
  });

  it('inactive exercises are hidden unless asked for; order is by name in the language', () => {
    const list = library.map((e) => (e.id === 'PLANK' ? { ...e, active: false } : e));
    expect(ids({ query: 'plank' }, list)).toEqual(['SIDE_PLANK']);
    expect(ids({ query: 'plank', includeInactive: true }, list)).toEqual(['PLANK', 'SIDE_PLANK']);
    const he = ids({ categories: ['CORE'] }, library, 'he').map((id) => builtinExercise(id)!.name.he);
    expect(he).toEqual([...he].sort((a, b) => a.localeCompare(b, 'he')));
  });

  it('body areas come from primary muscles plus declared full-body / posterior-chain', () => {
    expect(bodyAreasOf(builtinExercise('BURPEE')!)).toEqual(expect.arrayContaining(['FULL_BODY']));
    expect(bodyAreasOf(builtinExercise('PUSH_UP')!)).toEqual(['UPPER_BODY']);
  });
});

describe('custom exercise validation', () => {
  const valid: CustomExerciseInput = {
    name: '  Sandbag Carry ',
    categories: ['STRENGTH', 'CONDITIONING'],
    primaryMuscles: ['FOREARMS_GRIP'],
    secondaryMuscles: ['ABDOMINALS'],
    difficulty: 'INTERMEDIATE',
    sports: [],
    equipment: [],
    measurementType: 'DURATION',
    comparison: 'HIGHER_IS_BETTER',
    usesLoad: true,
    instructions: ' Carry it. ',
    tutorialUrl: '',
  };

  it('accepts a full definition; trims text only; the name is the user’s in both languages', () => {
    const result = validateCustomExercise(valid, []);
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        name: { he: 'Sandbag Carry', en: 'Sandbag Carry' },
        instructions: { he: 'Carry it.', en: 'Carry it.' },
        measurement: { type: 'DURATION', comparison: 'HIGHER_IS_BETTER', usesLoad: true, distanceM: null },
        tutorialUrl: null,
      }),
    });
  });

  it.each([
    ['blank name', { name: '  ' }, { name: 'REQUIRED' }],
    ['name over the limit', { name: 'x'.repeat(EXERCISE_NAME_MAX_LENGTH + 1) }, { name: 'TOO_LONG' }],
    ['no category', { categories: [] }, { categories: 'REQUIRED' }],
    ['unknown category', { categories: ['YOGA'] }, { categories: 'UNKNOWN_CODE' }],
    ['no primary muscle (physical exercise)', { primaryMuscles: [] }, { primaryMuscles: 'REQUIRED' }],
    [
      'secondary repeats primary',
      { secondaryMuscles: ['FOREARMS_GRIP'] },
      { secondaryMuscles: 'OVERLAPS_PRIMARY' },
    ],
    ['no difficulty', { difficulty: null }, { difficulty: 'REQUIRED' }],
    ['unknown equipment', { equipment: [['ROCKET']] }, { equipment: 'UNKNOWN_CODE' }],
    ['empty equipment option', { equipment: [[]] }, { equipment: 'EMPTY_OPTION' }],
    ['no measurement', { measurementType: null }, { measurementType: 'REQUIRED' }],
    ['DURATION without a declared comparison', { comparison: null }, { comparison: 'REQUIRED' }],
    [
      'a load on makes / attempts',
      { measurementType: 'MADE_ATTEMPTS', comparison: null },
      { usesLoad: 'NOT_FOR_TYPE' },
    ],
    ['a non-http link', { tutorialUrl: 'javascript:alert(1)' }, { tutorialUrl: 'INVALID_URL' }],
  ])('rejects %s', (_label, change, errors) => {
    expect(validateCustomExercise({ ...valid, ...change } as CustomExerciseInput, [])).toEqual({
      ok: false,
      errors,
    });
  });

  it('a duplicate custom name (case-insensitive) is refused', () => {
    expect(validateCustomExercise(valid, ['sandbag carry'])).toEqual({
      ok: false,
      errors: { name: 'DUPLICATE' },
    });
  });

  it('a basketball skill drill may have no muscle group', () => {
    const drill = { ...valid, categories: ['BASKETBALL_SHOOTING'], primaryMuscles: [], secondaryMuscles: [] };
    expect(
      validateCustomExercise(
        { ...drill, measurementType: 'MADE_ATTEMPTS', comparison: null, usesLoad: false },
        [],
      ).ok,
    ).toBe(true);
  });

  it('an alternative equipment list keeps its options', () => {
    const result = validateCustomExercise(
      { ...valid, equipment: [['KETTLEBELL'], ['DUMBBELL', 'DUMBBELL']] },
      [],
    );
    expect(result.ok && result.value.equipment).toEqual([['KETTLEBELL'], ['DUMBBELL']]);
  });
});
