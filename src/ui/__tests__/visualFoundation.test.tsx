import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { Card } from '../Card';
import { EmptyState } from '../EmptyState';
import { IconButton } from '../IconButton';
import { Pill, SELECTED_MARK, Toggle } from '../Pill';
import { SectionHeader } from '../SectionHeader';
import { StatusBadge } from '../StatusBadge';
import {
  categoryTones,
  colors,
  elevation,
  iconSize,
  radius,
  semantic,
  touch,
  typography,
  type Tone,
} from '../theme';

/** UX-VISUAL-001A: design tokens and shared visual primitives. */

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(bl!);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
const HEX = /^#[0-9A-F]{6}$/i;

describe('tokens', () => {
  it('existing screens keep their exact colours, spacing and button heights', () => {
    expect(colors).toEqual({
      court: '#E8732C',
      courtDark: '#B9551A',
      ink: '#1B1B1F',
      inkMuted: '#5D5E66',
      surface: '#FFFFFF',
      background: '#F6F3EE',
      border: '#E2DDD5',
      success: '#1E8E4F',
      danger: '#C6372F',
    });
    expect(touch.buttonMinHeight).toBe(56);
    expect(touch.trainingButtonMinHeight).toBe(88);
  });

  it('every interactive control has a 48 dp minimum target', () => {
    expect(touch.minTarget).toBe(48);
  });

  it('the six approved training-domain tones exist, each readable as text on its own tint', () => {
    expect(Object.keys(categoryTones).sort()).toEqual(['basketball', 'mobility', 'power', 'skill', 'speed', 'strength']);
    for (const [name, tone] of Object.entries(categoryTones) as [string, Tone][]) {
      for (const c of [tone.base, tone.strong, tone.tint]) expect(c).toMatch(HEX);
      expect({ name, ratio: contrast(tone.strong, tone.tint) >= 4.5 }).toEqual({ name, ratio: true });
    }
    expect(categoryTones.basketball.base).toBe(colors.court); // Basketball stays the brand orange
    // Six distinct identities, not one colour six times.
    expect(new Set(Object.values(categoryTones).map((t) => t.base)).size).toBe(6);
  });

  it('semantic state tones (error / warning / success / neutral) are readable; text roles meet AA on surfaces', () => {
    for (const key of ['error', 'warning', 'success', 'neutral'] as const) {
      const tone = semantic[key];
      expect({ key, ok: contrast(tone.strong, tone.tint) >= 4.5 }).toEqual({ key, ok: true });
    }
    expect(contrast(semantic.textPrimary, semantic.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(semantic.textSecondary, semantic.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(semantic.textSecondary, semantic.background)).toBeGreaterThanOrEqual(4.5);
    expect(semantic.disabled.opacity).toBeGreaterThan(0);
    expect(semantic.disabled.opacity).toBeLessThan(1);
  });

  it('radius, typography, elevation and icon sizes are defined scales', () => {
    expect(radius.sm).toBeLessThan(radius.md);
    expect(radius.md).toBeLessThan(radius.lg);
    expect(typography.title.fontSize).toBeGreaterThan(typography.heading.fontSize);
    expect(typography.body.fontSize).toBeGreaterThanOrEqual(16); // readable body text
    expect(typography.caption.fontSize).toBeGreaterThanOrEqual(14);
    expect(elevation.card.elevation).toBeGreaterThan(0);
    expect(iconSize.sm).toBeLessThan(iconSize.lg);
    expect(iconSize.xl).toBeLessThan(touch.minTarget); // an icon always fits inside its touch target
  });
});

describe('primitives are RTL / LTR safe (logical layout only)', () => {
  it.each(['Card', 'Pill', 'SectionHeader', 'IconButton', 'StatusBadge', 'EmptyState'])('%s uses no left / right styles', (name) => {
    const source = readFileSync(resolve(__dirname, '..', `${name}.tsx`), 'utf8');
    expect(source).not.toMatch(/\b(margin|padding|border)(Left|Right)\b|\b(left|right)\s*:|textAlign:\s*'(left|right)'/);
  });
});

describe('Card', () => {
  it('a plain container: no button role, testID kept', () => {
    render(
      <Card testID="card">
        <Text>Body</Text>
      </Card>,
    );
    expect(screen.getByTestId('card').props.accessibilityRole).toBeUndefined();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('pressable: a ≥ 48 dp button with label, selected / disabled exposed; disabled does not fire', () => {
    const onPress = jest.fn();
    const { rerender } = render(
      <Card testID="card" onPress={onPress} accessibilityLabel="Basketball, 34 exercises" tone="basketball" selected>
        <Text>Basketball</Text>
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Basketball, 34 exercises');
    expect(card.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(flat('card').minHeight).toBeGreaterThanOrEqual(touch.minTarget);
    expect(flat('card').borderStartColor).toBe(categoryTones.basketball.base); // logical start edge
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(
      <Card testID="card" onPress={onPress} disabled>
        <Text>Basketball</Text>
      </Card>,
    );
    expect(screen.getByTestId('card').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Pill / Toggle', () => {
  it('Pill: ≥ 48 dp; selected says ✓ in text (not colour alone) and in accessibilityState', () => {
    const onPress = jest.fn();
    const { rerender } = render(<Pill testID="p" label="Dumbbells" onPress={onPress} />);
    expect(screen.getByTestId('p-label').props.children).toBe('Dumbbells');
    expect(screen.getByTestId('p').props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(flat('p').minHeight).toBeGreaterThanOrEqual(touch.minTarget);
    expect(flat('p').minWidth).toBeGreaterThanOrEqual(touch.minTarget);
    fireEvent.press(screen.getByTestId('p'));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Pill testID="p" label="Dumbbells" onPress={onPress} selected tone="strength" />);
    expect(screen.getByTestId('p-label').props.children).toBe(`${SELECTED_MARK}Dumbbells`);
    expect(screen.getByTestId('p').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('p').props.accessibilityLabel).toBe('Dumbbells');
    expect(flat('p').backgroundColor).toBe(categoryTones.strength.tint);
  });

  it('Pill disabled: does not fire and is announced disabled', () => {
    const onPress = jest.fn();
    render(<Pill testID="p" label="Barbell" onPress={onPress} disabled />);
    fireEvent.press(screen.getByTestId('p'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('p').props.accessibilityState.disabled).toBe(true);
  });

  it('Toggle: a switch with checked state; on shows ✓ in text', () => {
    const onPress = jest.fn();
    const { rerender } = render(<Toggle testID="t" label="Search all exercises" value={false} onPress={onPress} />);
    expect(screen.getByTestId('t').props.accessibilityRole).toBe('switch');
    expect(screen.getByTestId('t').props.accessibilityState).toEqual({ checked: false, disabled: false });
    fireEvent.press(screen.getByTestId('t'));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Toggle testID="t" label="Search all exercises" value onPress={onPress} />);
    expect(screen.getByTestId('t').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('t-label').props.children).toBe(`${SELECTED_MARK}Search all exercises`);
    expect(flat('t').minHeight).toBeGreaterThanOrEqual(touch.minTarget);
  });
});

describe('SectionHeader', () => {
  it('a header with optional subtitle and an end action', () => {
    render(
      <SectionHeader
        testID="h"
        title="אימון כושר"
        subtitle="לפי אזור בגוף"
        action={<Pill testID="h-action" label="הכול" onPress={() => {}} />}
      />,
    );
    expect(screen.getByTestId('h-title').props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('h-title').props.children).toBe('אימון כושר');
    expect(screen.getByTestId('h-subtitle').props.children).toBe('לפי אזור בגוף');
    expect(screen.getByTestId('h-action')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('h-title').props.style).textAlign).toBe('auto');
  });

  it('without a subtitle, none is rendered', () => {
    render(<SectionHeader testID="h" title="Fitness" />);
    expect(screen.queryByTestId('h-subtitle')).toBeNull();
  });
});

describe('IconButton', () => {
  it('≥ 48 × 48 dp, a required spoken label, selected / disabled exposed', () => {
    const onPress = jest.fn();
    const { rerender } = render(
      <IconButton testID="i" icon={<Text>+</Text>} accessibilityLabel="Add exercise" onPress={onPress} />,
    );
    const button = screen.getByTestId('i');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Add exercise');
    expect(flat('i').minWidth).toBeGreaterThanOrEqual(touch.minTarget);
    expect(flat('i').minHeight).toBeGreaterThanOrEqual(touch.minTarget);
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<IconButton testID="i" icon={<Text>+</Text>} accessibilityLabel="Add exercise" onPress={onPress} disabled />);
    fireEvent.press(screen.getByTestId('i'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('i').props.accessibilityState.disabled).toBe(true);
  });
});

describe('StatusBadge', () => {
  it.each(['success', 'warning', 'error', 'neutral'] as const)('%s: the status is the text; colours from the semantic tone', (tone) => {
    render(<StatusBadge testID="b" label="Completed" tone={tone} />);
    expect(screen.getByTestId('b-label').props.children).toBe('Completed');
    expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Completed');
    expect(flat('b').backgroundColor).toBe(semantic[tone].tint);
    expect(StyleSheet.flatten(screen.getByTestId('b-label').props.style).color).toBe(semantic[tone].strong);
  });
});

describe('EmptyState', () => {
  it('title (header), message and the one action that fixes it', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        testID="e"
        title="No workouts yet"
        message="Create your first workout."
        action={{ label: 'Create workout', onPress, testID: 'e-action' }}
      />,
    );
    expect(screen.getByTestId('e-title').props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('e-message').props.children).toBe('Create your first workout.');
    fireEvent.press(screen.getByTestId('e-action'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(screen.getByTestId('e-action').props.style).minHeight).toBeGreaterThanOrEqual(touch.minTarget);
  });

  it('works without message or action', () => {
    render(<EmptyState testID="e" title="No exercises found" />);
    expect(screen.queryByTestId('e-message')).toBeNull();
    expect(screen.getByTestId('e-title').props.children).toBe('No exercises found');
  });
});
