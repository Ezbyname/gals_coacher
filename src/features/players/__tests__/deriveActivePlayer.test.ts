import {
  MissingPlayerContextError,
  NO_ACTIVE_PLAYER,
  requireActivePlayer,
  type ActivePlayerContextValue,
} from '@/domain/training/activePlayer';

import { deriveActivePlayer } from '../ActivePlayerContext';

const daniel = { id: 'p-daniel', name: 'Daniel' };
const maya = { id: 'p-maya', name: 'Maya' };
const resolved = (p: typeof daniel): ActivePlayerContextValue => ({
  status: 'resolved',
  activePlayerId: p.id,
  activePlayer: p,
  source: 'route',
});

describe('deriveActivePlayer — no stale Player after a switch', () => {
  const danielLoaded = { forId: daniel.id, value: resolved(daniel) };

  it('serves a load only for the id it was made for', () => {
    expect(deriveActivePlayer(daniel.id, 'route', false, danielLoaded)).toEqual(resolved(daniel));
  });

  it("Daniel → Maya: Maya is 'loading' until Maya loads; Daniel never leaks", () => {
    const value = deriveActivePlayer(maya.id, 'route', false, danielLoaded);
    expect(value).toEqual({ status: 'loading', activePlayerId: maya.id, source: 'route' });
    expect(() => requireActivePlayer(value)).toThrow(MissingPlayerContextError);
  });

  it('keeps the source it was given (explicit selection owned by its flow)', () => {
    expect(deriveActivePlayer(maya.id, 'explicit-selection', false, null)).toMatchObject({
      status: 'loading',
      source: 'explicit-selection',
    });
  });

  it('no id or a failed boot is unresolved', () => {
    expect(deriveActivePlayer('', 'route', false, danielLoaded)).toEqual(NO_ACTIVE_PLAYER);
    expect(deriveActivePlayer(daniel.id, 'route', true, danielLoaded)).toEqual({
      status: 'unresolved',
      reason: 'error',
    });
  });
});
