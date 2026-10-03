import AsyncStorage from '@react-native-async-storage/async-storage';

import { PREFERENCE_KEYS } from '../keys';
import { clearReloadTarget, markReloadTarget, readReloadTarget } from '../rtlReloadGuard';

describe('rtl reload guard', () => {
  beforeEach(() => AsyncStorage.clear());

  it('uses the approved AsyncStorage key', () => {
    expect(PREFERENCE_KEYS.rtlReloadTarget).toBe('@gals-coacher/rtl.reloadTarget');
  });

  it('is empty by default', async () => {
    expect(await readReloadTarget()).toBeNull();
  });

  it('marks, reads back and clears the attempted target', async () => {
    await markReloadTarget('rtl');
    expect(await AsyncStorage.getItem('@gals-coacher/rtl.reloadTarget')).toBe('rtl');
    expect(await readReloadTarget()).toBe('rtl');
    await clearReloadTarget();
    expect(await readReloadTarget()).toBeNull();
  });

  it('ignores an invalid stored value', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.rtlReloadTarget, 'sideways');
    expect(await readReloadTarget()).toBeNull();
  });

  it('propagates read errors (caller fails safe) but clearing never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = {
      getItem: () => Promise.reject(new Error('disk')),
      setItem: () => Promise.reject(new Error('disk')),
      removeItem: () => Promise.reject(new Error('disk')),
    };
    await expect(readReloadTarget(broken)).rejects.toThrow('disk');
    await expect(clearReloadTarget(broken)).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
