import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { systemClock } from '@/services/clock/Clock';
import { createSequentialIdService } from '@/services/ids/IdService';
import { createFakeDirectionService } from '@/test-support/fakeDirection';
import type { Services } from '@/services';

import { AppProvider, useApp } from '../AppProvider';

function BootStatus() {
  const { boot, services } = useApp();
  return (
    <>
      <Text testID="boot">{boot.status}</Text>
      <Text testID="id">{services.ids.newUuid()}</Text>
    </>
  );
}

function servicesWithAudio(audio: Services['audio']): Services {
  return {
    audio,
    haptics: { tap: jest.fn(), success: jest.fn(), warning: jest.fn() },
    clock: systemClock,
    ids: createSequentialIdService(),
    direction: createFakeDirectionService(false),
  };
}

describe('AppProvider', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('boots the database even when audio preload rejects', async () => {
    const services = servicesWithAudio({
      preload: () => Promise.reject(new Error('asset missing')),
      play: jest.fn(),
      release: jest.fn(),
    });
    render(
      <AppProvider services={services}>
        <BootStatus />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('boot')).toHaveTextContent('ready'));
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[audio] preload failed'), expect.any(Error)),
    );
  });

  it('boots even when audio preload throws synchronously and release throws', async () => {
    const services = servicesWithAudio({
      preload: () => {
        throw new Error('sync boom');
      },
      play: jest.fn(),
      release: () => {
        throw new Error('release boom');
      },
    });
    const { unmount } = render(
      <AppProvider services={services}>
        <BootStatus />
      </AppProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('boot')).toHaveTextContent('ready'));
    expect(() => unmount()).not.toThrow();
  });

  it('exposes the injected id service (deterministic ids in tests)', async () => {
    render(
      <AppProvider services={servicesWithAudio({ preload: async () => {}, play: jest.fn(), release: jest.fn() })}>
        <BootStatus />
      </AppProvider>,
    );
    expect(screen.getByTestId('id')).toHaveTextContent('00000000-0000-4000-8000-000000000001');
    await waitFor(() => expect(screen.getByTestId('boot')).toHaveTextContent('ready'));
  });
});
