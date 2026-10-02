import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import ChildrenScreen from '../children';
import DiagnosticsScreen from '../diagnostics';
import ExercisesScreen from '../exercises';
import HistoryScreen from '../history';
import HomeScreen from '../index';
import QuickTrainingScreen from '../quick-training';
import RootLayout from '../_layout';

const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  'quick-training': QuickTrainingScreen,
  children: ChildrenScreen,
  exercises: ExercisesScreen,
  history: HistoryScreen,
  diagnostics: DiagnosticsScreen,
};

describe('navigation', () => {
  it('opens on Home and navigates to Quick Training', async () => {
    const app = renderRouter(routes, { initialUrl: '/' });
    expect(app.getPathname()).toBe('/');
    fireEvent.press(screen.getByTestId('home-quick-training'));
    await waitFor(() => expect(app.getPathname()).toBe('/quick-training'));
    expect(screen.getByText('Arrives in Phase 5. See docs/ROADMAP.md.')).toBeTruthy();
  });

  it('boots the local database and reports it on Diagnostics', async () => {
    const app = renderRouter(routes, { initialUrl: '/' });
    fireEvent.press(screen.getByTestId('home-diagnostics'));
    await waitFor(() => expect(app.getPathname()).toBe('/diagnostics'));
    await waitFor(() =>
      expect(screen.getByTestId('diag-sqlite')).toHaveTextContent(/ready · schema v1/),
    );
  });
});
