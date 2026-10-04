import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { RatingScale } from '../RatingScale';

function renderScale(value: 1 | 2 | 3 | 4 | 5 | null, onChange = jest.fn(), error?: string) {
  render(
    <RatingScale
      testID="scale"
      label="Shooting"
      values={[1, 2, 3, 4, 5] as const}
      value={value}
      onChange={onChange}
      lowAnchor="low"
      highAnchor="high"
      choiceLabel={(v) => `Shooting, ${v} of 5`}
      error={error}
    />,
  );
  return onChange;
}

describe('RatingScale', () => {
  it('renders the values lowest first in an explicitly left-to-right row', () => {
    renderScale(null);
    expect(screen.getAllByRole('radio').map((n) => n.props.testID)).toEqual([
      'scale-1',
      'scale-2',
      'scale-3',
      'scale-4',
      'scale-5',
    ]);
    expect(StyleSheet.flatten(screen.getByTestId('scale-scale').props.style)).toMatchObject({
      flexDirection: 'row',
      direction: 'ltr',
    });
    expect(StyleSheet.flatten(screen.getByTestId('scale-anchors').props.style)).toMatchObject({
      direction: 'ltr',
    });
  });

  it('anchors only the two ends', () => {
    renderScale(null);
    expect(screen.getByTestId('scale-anchor-low').props.children).toBe('low');
    expect(screen.getByTestId('scale-anchor-high').props.children).toBe('high');
    expect(screen.queryAllByTestId(/^scale-anchor-/)).toHaveLength(2);
  });

  it('exposes radio role, label and checked/selected state', () => {
    renderScale(3);
    const three = screen.getByTestId('scale-3');
    expect(three.props.accessibilityRole).toBe('radio');
    expect(three.props.accessibilityLabel).toBe('Shooting, 3 of 5');
    expect(three.props.accessibilityState).toEqual({ selected: true, checked: true });
    expect(screen.getByTestId('scale-4').props.accessibilityState).toEqual({
      selected: false,
      checked: false,
    });
  });

  it('reports the pressed value; pressing the selected one does not clear it', () => {
    const onChange = renderScale(3);
    fireEvent.press(screen.getByTestId('scale-5'));
    fireEvent.press(screen.getByTestId('scale-3'));
    expect(onChange.mock.calls).toEqual([[5], [3]]);
  });

  it('shows the error note only when given', () => {
    renderScale(null, jest.fn(), 'missing');
    expect(screen.getByTestId('scale-error').props.children).toBe('missing');
  });
});
