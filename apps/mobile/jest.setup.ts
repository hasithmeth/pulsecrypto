import { setUpTests } from 'react-native-reanimated';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual<object>('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: null },
}));

setUpTests();
