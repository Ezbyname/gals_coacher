import { createStartupGate } from '../startupGate';

describe('startup gate', () => {
  it('1. time complete + i18n + app ready → opens', () => {
    const onOpen = jest.fn();
    const gate = createStartupGate(onOpen);
    gate.markI18nReady();
    gate.markAppReady();
    gate.markTimeElapsed();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(gate.isOpen()).toBe(true);
  });

  it('2. time incomplete + app ready → stays', () => {
    const onOpen = jest.fn();
    const gate = createStartupGate(onOpen);
    gate.markI18nReady();
    gate.markAppReady();
    expect(onOpen).not.toHaveBeenCalled();
    expect(gate.isOpen()).toBe(false);
  });

  it('3. time complete + app not ready → stays', () => {
    const onOpen = jest.fn();
    const gate = createStartupGate(onOpen);
    gate.markTimeElapsed();
    gate.markI18nReady();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('3b. time complete + direction/i18n not ready → stays', () => {
    const onOpen = jest.fn();
    const gate = createStartupGate(onOpen);
    gate.markTimeElapsed();
    gate.markAppReady();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('4. app becomes ready after time complete → opens once', () => {
    const onOpen = jest.fn();
    const gate = createStartupGate(onOpen);
    gate.markTimeElapsed();
    gate.markI18nReady();
    gate.markAppReady();
    gate.markAppReady();
    gate.markTimeElapsed();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('5. time completes after app ready → opens once', () => {
    const onOpen = jest.fn();
    const gate = createStartupGate(onOpen);
    gate.markAppReady();
    gate.markI18nReady();
    gate.markTimeElapsed();
    gate.markI18nReady();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
