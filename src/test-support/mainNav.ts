import { screen } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';

/**
 * With the main navigation shell (NAV-001) the bar at the bottom keeps clear
 * of the device's system area: it — and only it — carries the bottom inset,
 * and the screens above it end at the bar (no doubled gap).
 */
export function expectBottomInsetOnMainNavOnly(inset: number) {
  const bar = screen.getByTestId('main-nav');
  expect(StyleSheet.flatten(bar.props.style).paddingBottom).toBe(inset);
}
