/**
 * Visual design tokens (UX-VISUAL-001A). Screens use these names, never raw
 * values. The original `colors` / `spacing` / `touch` keep their values, so
 * existing screens look exactly as before; the semantic layers below are the
 * foundation for the incremental visual refresh (001B–001E).
 *
 * Colour helps recognition but never carries meaning alone: every state and
 * category is also said in text (✓, a label, a status word) — see the shared
 * primitives in src/ui.
 */
export const colors = {
  court: '#E8732C',
  courtDark: '#B9551A',
  ink: '#1B1B1F',
  inkMuted: '#5D5E66',
  surface: '#FFFFFF',
  background: '#F6F3EE',
  border: '#E2DDD5',
  success: '#1E8E4F',
  danger: '#C6372F',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/**
 * Touch sizes in dp. `minTarget` is the minimum for ANY interactive control;
 * training controls are used one-handed on a court, so they are bigger.
 */
export const touch = { minTarget: 48, buttonMinHeight: 56, trainingButtonMinHeight: 88 } as const;

/** One tone: `base` for fills / accents, `strong` for text on `tint`, `tint` for quiet backgrounds. */
export interface Tone {
  readonly base: string;
  readonly strong: string;
  readonly tint: string;
}

/** Semantic UI roles (what a colour MEANS, not what it looks like). */
export const semantic = {
  textPrimary: colors.ink,
  textSecondary: colors.inkMuted,
  textOnAccent: '#FFFFFF',
  background: colors.background,
  surface: colors.surface,
  border: colors.border,
  /** Selected: a strong ink outline plus a text mark (✓) — never colour alone. */
  selected: { border: colors.ink, tint: '#EFE9E0' },
  /** Disabled: muted text and reduced opacity, plus accessibilityState.disabled. */
  disabled: { text: colors.inkMuted, opacity: 0.45 },
  error: { base: colors.danger, strong: '#9E2A24', tint: '#FBE7E5' } satisfies Tone,
  warning: { base: '#D08A00', strong: '#7A5200', tint: '#FFF3D6' } satisfies Tone,
  success: { base: colors.success, strong: '#156B3B', tint: '#E3F4EA' } satisfies Tone,
  neutral: { base: colors.inkMuted, strong: colors.ink, tint: '#EFEDE8' } satisfies Tone,
} as const;

/**
 * Training-domain tones (owner direction, 2026-10-08): Basketball orange,
 * Fitness / Strength blue, Power warm amber, Speed / Agility green, Mobility /
 * Recovery calm teal, Skill / Coordination purple. Which taxonomy node uses
 * which tone is decided by the feature (001C), not here.
 */
export const categoryTones = {
  basketball: { base: colors.court, strong: '#9A4513', tint: '#FDEBDD' },
  strength: { base: '#1F6FB2', strong: '#14507F', tint: '#E3EEF8' },
  power: { base: '#E0A100', strong: '#7A5300', tint: '#FFF4D6' },
  speed: { base: '#2E9D57', strong: '#1B6A39', tint: '#E2F4E8' },
  mobility: { base: '#2BA6A0', strong: '#17675F', tint: '#DFF4F2' },
  skill: { base: '#7A4CC2', strong: '#56338F', tint: '#EEE6FA' },
} as const satisfies Record<string, Tone>;

export type CategoryTone = keyof typeof categoryTones;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;

/** Type scale (sp). Weights as React Native strings. */
export const typography = {
  title: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  heading: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  label: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  caption: { fontSize: 14, fontWeight: '400', lineHeight: 19 },
} as const;

/** Elevation: subtle, for cards that sit on the page background. No runtime cost beyond a static style. */
export const elevation = {
  none: {},
  card: {
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
} as const;

export const iconSize = { sm: 16, md: 20, lg: 24, xl: 32 } as const;
