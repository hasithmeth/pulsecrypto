import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/**
 * The single place that names the storage engine. Persisted stores depend on
 * zustand's StateStorage contract, so moving to MMKV or SecureStore is a
 * change to this file only.
 */
export const appStorage: StateStorage = AsyncStorage;
