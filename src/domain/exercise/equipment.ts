/**
 * Equipment (TRAIN-001): a catalog of stable ids. An exercise lists
 * alternative equipment OPTIONS: every item of one option is needed, any one
 * option is enough, and an exercise with no option needs nothing (bodyweight).
 *
 *   Goblet Squat:  [[KETTLEBELL], [DUMBBELL]]   — a kettlebell OR a dumbbell
 *   Bench Press:   [[BARBELL, BENCH, SQUAT_RACK]] — all three
 *   Push-up:       []                            — no equipment
 *
 * A future Gym / Equipment Profile ("Home: bands + dumbbells") is just a
 * stored set of these ids; nothing here assumes it does or does not exist.
 */
export const EQUIPMENT = [
  'DUMBBELL',
  'BARBELL',
  'WEIGHT_PLATES',
  'KETTLEBELL',
  'RESISTANCE_BAND',
  'CABLE_MACHINE',
  'GYM_MACHINE',
  'SMITH_MACHINE',
  'BENCH',
  'SQUAT_RACK',
  'PULL_UP_BAR',
  'DIP_BARS',
  'SUSPENSION_TRAINER',
  'MEDICINE_BALL',
  'SLAM_BALL',
  'STABILITY_BALL',
  'BOSU',
  'PLYO_BOX',
  'SLED',
  'BATTLE_ROPES',
  'JUMP_ROPE',
  'TREADMILL',
  'STATIONARY_BIKE',
  'ROWING_MACHINE',
  'SKI_ERG',
  'CONES',
  'AGILITY_LADDER',
  'BASKETBALL',
  'BASKETBALL_HOOP',
  'RUNNING_AREA',
  'MAT',
] as const;
export type EquipmentId = (typeof EQUIPMENT)[number];

export function isEquipmentId(value: unknown): value is EquipmentId {
  return typeof value === 'string' && (EQUIPMENT as readonly string[]).includes(value);
}

/** One way to do the exercise: all of these items together (an empty option = nothing needed). */
export type EquipmentOption = readonly EquipmentId[];

/** Needs no equipment at all: no option, or an empty option. */
export function needsNoEquipment(options: readonly EquipmentOption[]): boolean {
  return options.length === 0 || options.some((option) => option.length === 0);
}

/** Can be done with exactly the equipment available: at least one option is fully covered. */
export function doableWith(options: readonly EquipmentOption[], available: readonly EquipmentId[]): boolean {
  return (
    needsNoEquipment(options) || options.some((option) => option.every((item) => available.includes(item)))
  );
}
