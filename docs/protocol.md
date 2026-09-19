# PulseCrypto wire protocol

Version 1. The single source of truth is [`packages/contracts`](../packages/contracts/src), a set of zod schemas imported by both the gateway and the app, so the two cannot drift apart silently.

| Transport | Endpoint          | Purpose                                |
| --------- | ----------------- | -------------------------------------- |
| HTTP      | `GET /pairs/meta` | Metadata for every supported pair      |
| HTTP      | `GET /health`     | Upstream state, client count, counters |
| WebSocket | `/ws`             | Live market stream and client control  |

All WebSocket frames are JSON text with a `type` discriminant. Numbers are JSON numbers, timestamps are Unix milliseconds.

## REST

### `GET /pairs/meta`

```json
{
  "updatedAt": 1789824705297,
  "pairs": [
    {
      "symbol": "BTCUSDT",
      "base": "BTC",
      "quote": "USDT",
      "displayName": "Bitcoin",
      "status": "TRADING",
      "priceDecimals": 2,
      "quantityDecimals": 5,
      "high24h": 81741,
      "low24h": 78191.81,
      "volume24h": 19234.72941
    }
  ]
}
```

`status` is `TRADING`, `HALT` or `BREAK`. Names, precision and status come from a static registry. The 24 hour figures are live values from Binance's ticker stream and are `null` until the first ticker arrives. The response is sent with `cache-control: no-store`.

## WebSocket: server to client

### `hello`

Sent once, immediately after the socket opens. A client should treat the connection as usable only after receiving it.

```json
{
  "type": "hello",
  "protocolVersion": 1,
  "serverTime": 1789824705297,
  "intervalMs": 100,
  "limits": { "minIntervalMs": 10, "maxIntervalMs": 1000 },
  "pairs": ["BTCUSDT", "ETHUSDT"],
  "upstream": "live"
}
```

### `market`

The stream itself. One frame per client interval, containing only what changed since that client's previous frame. Both arrays may be empty but at least one entry is always present, because quiet ticks send nothing.

```json
{
  "type": "market",
  "ts": 1789824705301,
  "tickers": [
    {
      "pair": "BTCUSDT",
      "ts": 1789824705290,
      "price": 81270.01,
      "change24hPct": 1.12,
      "high24h": 81741,
      "low24h": 78191.81,
      "volume24h": 19234.72941
    }
  ],
  "books": [
    {
      "pair": "BTCUSDT",
      "ts": 1789824705301,
      "lastUpdateId": 100342606076,
      "spread": 0.01,
      "spreadPct": 0.000012,
      "buyPressure": 71,
      "sellPressure": 29,
      "bids": [
        [81270, 4.51015],
        [81269.99, 0.656]
      ],
      "asks": [
        [81270.01, 2.36956],
        [81270.02, 0.00062]
      ]
    }
  ]
}
```

- **Tickers** are sent for every pair, to every client. `price` is the last trade price.
- **Books** are sent only for pairs the client subscribed to. Levels are `[price, quantity]`, best price first, up to `BOOK_DEPTH` (default 20) per side.
- `spread` is best ask minus best bid. `spreadPct` is the spread as a percentage of the mid price.
- `buyPressure` and `sellPressure` are each side's share of the resting quantity across the visible levels (order book imbalance). They always sum to 100.

This splits the brief's example payload into two channels. A watchlist needs eight small tickers; only the open detail screen needs a 40-level book. Sending every book to every client would multiply bandwidth and JSON parsing on the phone for data that is never displayed.

### `status`

Pushed whenever the gateway's connection to Binance changes, and reused as a heartbeat when a client has received nothing for `CLIENT_HEARTBEAT_MS` (default 3 s). Values: `connecting`, `live`, `down`.

```json
{ "type": "status", "upstream": "down" }
```

### `configured`

Acknowledges `configure` with the interval actually applied.

```json
{ "type": "configured", "intervalMs": 250 }
```

### `pong`

```json
{ "type": "pong", "id": 7, "serverTime": 1789824705297 }
```

### `error`

```json
{ "type": "error", "code": "unknown_pair", "message": "Unknown pair NOPEUSDT" }
```

Codes: `invalid_message`, `unknown_pair`.

## WebSocket: client to server

Inbound frames are limited to 4 KB and validated against the schema.

| Message       | Shape                                                             | Effect                                                                               |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `subscribe`   | `{ "type": "subscribe", "channel": "book", "pair": "BTCUSDT" }`   | Start receiving that pair's book. The current snapshot arrives on the next tick.     |
| `unsubscribe` | `{ "type": "unsubscribe", "channel": "book", "pair": "BTCUSDT" }` | Stop receiving it.                                                                   |
| `configure`   | `{ "type": "configure", "intervalMs": 250 }`                      | Request a per-client emit interval. Clamped to `limits` and snapped to a 10 ms grid. |
| `ping`        | `{ "type": "ping", "id": 7 }`                                     | Application-level round trip, answered with `pong`.                                  |

## Connection lifecycle

| Event            | Behaviour                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liveness         | The gateway sends a protocol ping every 15 s and terminates clients that miss one. Clients cannot observe protocol pongs in React Native, so they treat 10 s of inbound silence as a dead link. |
| Invalid messages | Each one returns an `error`. After `CLIENT_MAX_INVALID_MESSAGES` (default 5) the socket is closed with code 4001.                                                                               |
| Capacity         | Beyond `MAX_CLIENTS` the socket is closed with code 4002.                                                                                                                                       |
| Shutdown         | Clients are closed with code 1001.                                                                                                                                                              |
| Slow consumer    | The socket is terminated without a close frame. A client that is not reading would never receive one, and terminating frees its buffers immediately.                                            |
