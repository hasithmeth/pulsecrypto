export const PROTOCOL_VERSION = 1;

export const STREAM_PATH = '/ws';
export const PAIRS_META_PATH = '/pairs/meta';

export const CloseCode = {
  ServerShutdown: 1001,
  ProtocolViolation: 4001,
  ServerFull: 4002,
} as const;

export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];
