import AsyncStorage from '@react-native-async-storage/async-storage';

/** The AsyncStorage subset the preferences need; injectable for tests. */
export interface PreferenceStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const asyncStoragePreferenceStore: PreferenceStore = AsyncStorage;
