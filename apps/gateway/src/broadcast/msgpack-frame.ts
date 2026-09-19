import { encode } from '@msgpack/msgpack';

const MAP_OF_FOUR = 0x84;
const FLOAT64 = 0xcb;
const FIXARRAY = 0x90;
const ARRAY16 = 0xdc;

const PREFIX = Buffer.concat([
  Buffer.from([MAP_OF_FOUR]),
  encode('type'),
  encode('market'),
  encode('ts'),
]);
const TICKERS_KEY = encode('tickers');
const BOOKS_KEY = encode('books');

function float64(value: number): Buffer {
  const bytes = Buffer.allocUnsafe(9);
  bytes[0] = FLOAT64;
  bytes.writeDoubleBE(value, 1);
  return bytes;
}

function arrayHeader(length: number): Buffer {
  if (length < 16) return Buffer.from([FIXARRAY | length]);
  if (length < 65_536) return Buffer.from([ARRAY16, length >> 8, length & 0xff]);
  throw new RangeError(`Too many elements for a market frame: ${length}`);
}

/**
 * Writes the frame's envelope by hand so the already-encoded elements can be
 * spliced in untouched. This keeps the serialise-once guarantee for binary
 * clients: a pair is packed once per change, not once per recipient.
 */
export function packMarketFrame(
  ts: number,
  tickers: readonly Uint8Array[],
  books: readonly Uint8Array[],
): Uint8Array {
  return Buffer.concat([
    PREFIX,
    float64(ts),
    TICKERS_KEY,
    arrayHeader(tickers.length),
    ...tickers,
    BOOKS_KEY,
    arrayHeader(books.length),
    ...books,
  ]);
}
