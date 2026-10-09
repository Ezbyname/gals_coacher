import {
  MissingPlayerContextError,
  NO_ACTIVE_PLAYER,
  requireActivePlayer,
  resolveGlobalTarget,
  type ActivePlayerContextValue,
} from '../activePlayer';

const daniel = { id: 'p-daniel', name: 'Daniel' };
const maya = { id: 'p-maya', name: 'Maya' };
const resolved = (p: typeof daniel): ActivePlayerContextValue => ({
  status: 'resolved',
  activePlayerId: p.id,
  activePlayer: p,
  source: 'route',
});

describe('requireActivePlayer — the one guard for Player-specific training actions', () => {
  it('returns the resolved Player', () => {
    expect(requireActivePlayer(resolved(daniel))).toEqual(daniel);
  });

  it.each<ActivePlayerContextValue>([
    NO_ACTIVE_PLAYER,
    { status: 'loading', activePlayerId: 'p-daniel', source: 'route' },
    { status: 'unresolved', reason: 'not-found' },
    { status: 'unresolved', reason: 'error' },
  ])('refuses to proceed without a resolved Player (%o)', (context) => {
    expect(() => requireActivePlayer(context)).toThrow(MissingPlayerContextError);
  });

  it('outside any provider there is no Player — never a default one', () => {
    expect(NO_ACTIVE_PLAYER).toEqual({ status: 'unresolved', reason: 'none' });
  });
});

describe('resolveGlobalTarget — a global flow names its Player explicitly', () => {
  it('no Players: nothing to target', () => {
    expect(resolveGlobalTarget([])).toEqual({ kind: 'none' });
  });
  it('one Player: safe preselection (shown as the target)', () => {
    expect(resolveGlobalTarget([daniel])).toEqual({ kind: 'preselected', player: daniel });
  });
  it('several Players: an explicit choice, never a guess or the last one used', () => {
    expect(resolveGlobalTarget([daniel, maya])).toEqual({ kind: 'choose', players: [daniel, maya] });
  });
});
