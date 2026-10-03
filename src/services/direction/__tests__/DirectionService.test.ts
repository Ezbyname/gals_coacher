import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';

import { createNativeDirectionService } from '../DirectionService';

describe('native DirectionService', () => {
  let order: string[];
  beforeEach(() => {
    order = [];
    jest.spyOn(I18nManager, 'allowRTL').mockImplementation((v) => void order.push(`allowRTL(${v})`));
    jest.spyOn(I18nManager, 'forceRTL').mockImplementation((v) => void order.push(`forceRTL(${v})`));
  });
  afterEach(() => jest.restoreAllMocks());

  it('Hebrew: allowRTL(true) then forceRTL(true)', () => {
    createNativeDirectionService().apply(true);
    expect(order).toEqual(['allowRTL(true)', 'forceRTL(true)']);
  });

  it('English: forceRTL(false) then allowRTL(false)', () => {
    createNativeDirectionService().apply(false);
    expect(order).toEqual(['forceRTL(false)', 'allowRTL(false)']);
  });

  it('reports the running native direction', () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    expect(createNativeDirectionService().isRTL()).toBe(true);
  });

  it('reload uses expo reloadAppAsync', async () => {
    (reloadAppAsync as jest.Mock).mockResolvedValueOnce(undefined);
    await createNativeDirectionService().reload();
    expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  });
});
