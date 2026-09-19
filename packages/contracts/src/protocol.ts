export const PROTOCOL_VERSION = 2;

export const STREAM_PATH = '/ws';
export const PAIRS_META_PATH = '/pairs/meta';
export const SIGNUP_PATH = '/auth/signup';
export const LOGIN_PATH = '/auth/login';
export const ME_PATH = '/me';
export const MY_SETTINGS_PATH = '/me/settings';

export const CloseCode = {
  ServerShutdown: 1001,
  ProtocolViolation: 4001,
  ServerFull: 4002,
  Unauthorized: 4003,
} as const;

export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];
