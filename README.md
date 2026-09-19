# PulseCrypto

A real-time cryptocurrency market viewer.

- **`apps/gateway`**: a Node.js (Fastify) market-data gateway. It ingests Binance's public streams, conflates them, and broadcasts the latest state to clients at a configurable interval (default 100 ms).
- **`apps/mobile`**: a React Native (Expo SDK 57) app with a live watchlist, search, persisted favourites, a trading terminal with a live order book, and a telemetry screen.
- **`packages/contracts`**: the wire protocol, shared by both as zod schemas and inferred types.

> Screen recording: _add link here_

## Contents

1. [Quick start](#quick-start)
2. [Build, run and test](#build-run-and-test)
3. [Architecture](#architecture)
4. [Buffering strategy](#buffering-strategy)
5. [Architectural decisions](#architectural-decisions)
6. [Performance notes](#performance-notes)
7. [Requirement coverage](#requirement-coverage)
8. [Assumptions](#assumptions)
9. [Trade-offs](#trade-offs)
10. [Deviations from the mockup](#deviations-from-the-mockup)
11. [How AI-assisted tools were used](#how-ai-assisted-tools-were-used)

## Quick start

**Prerequisites**

- Node.js 22.18 or newer (developed on 24, see `.nvmrc`) and pnpm 11 (`corepack enable`)
- Android Studio with an emulator (AVD), and `ANDROID_HOME` pointing at the SDK
- Optional: Xcode with an iOS simulator

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS default
pnpm install
```

**Terminal 1: gateway** (listens on `0.0.0.0:4000`)

```bash
pnpm gateway
```

**Terminal 2: app on the Android emulator**

```bash
pnpm android
```

The Expo CLI starts Metro, installs a matching Expo Go on the emulator, and opens the app. Use `pnpm ios` for the iOS simulator.

No app configuration is needed. The app derives the gateway host from the Expo dev server, which works for the Android emulator, the iOS simulator and physical devices on the same network. To point it elsewhere, copy `apps/mobile/.env.example` to `.env` and set `EXPO_PUBLIC_GATEWAY_URL`.

**Troubleshooting**

| Symptom                                  | Fix                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gateway logs `upstream: down` repeatedly | `stream.binance.com` is blocked in some regions. Set `BINANCE_WS_URL=wss://data-stream.binance.vision` in `apps/gateway/.env`, or run offline with `MARKET_SOURCE=simulated`.                                                                          |
| Expo Go reports an unsupported SDK       | The store version of Expo Go tracks the newest SDK only. Let the CLI install the matching version (`pnpm android`), or make a development build: `cd apps/mobile && npx expo run:android`. Every dependency is Expo Go compatible, so both paths work. |
| App shows `RECONNECTING`                 | The gateway is not reachable from the device. Check it is running, then check `EXPO_PUBLIC_GATEWAY_URL`. The resolved URL is shown on the Telemetry tab.                                                                                               |

## Build, run and test

```bash
pnpm check                                  # lint + typecheck + tests for every package
pnpm test                                   # tests only (114 across the workspace)
pnpm format:check

pnpm --filter @pulsecrypto/gateway build    # bundle to apps/gateway/dist
pnpm --filter @pulsecrypto/gateway start    # run the production bundle
```

Gateway settings are environment variables, validated at boot (`apps/gateway/.env.example` lists all of them). The ones that matter most:

| Variable                                            | Default       | Meaning                                                           |
| --------------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| `BROADCAST_INTERVAL_MS`                             | `100`         | Default emit interval per client                                  |
| `MIN_CLIENT_INTERVAL_MS` / `MAX_CLIENT_INTERVAL_MS` | `10` / `1000` | Range a client may request                                        |
| `PAIRS`                                             | 8 USDT pairs  | Symbols to stream. The five required pairs plus BNB, ADA and LINK |
| `MARKET_SOURCE`                                     | `binance`     | `simulated` produces a synthetic high-rate feed with no network   |
| `CLIENT_HIGH_WATERMARK_BYTES`                       | `262144`      | Socket buffer size above which a client's ticks are skipped       |
| `CLIENT_MAX_CONGESTION_MS`                          | `5000`        | How long a client may stay congested before eviction              |

CI (`.github/workflows/ci.yml`) runs the format check, `pnpm check` and the gateway build.

## Architecture

```mermaid
flowchart LR
  B[(Binance<br/>combined stream)] -->|depth20@100ms<br/>aggTrade, ticker| F[BinanceFeed<br/>validate, reconnect, watchdog]
  S[SimulatedFeed] -.->|MARKET_SOURCE=simulated| MS
  F --> MS[MarketState<br/>latest value per pair + seq]
  MS --> E[FrameEncoder<br/>serialise once per change]
  E --> BR[Broadcaster<br/>shared tick, per-client cursors,<br/>backpressure policy]
  MS --> R[GET /pairs/meta]
  BR -->|WebSocket /ws| C[MarketStreamClient<br/>state machine, backoff, watchdog]
  R -->|HTTP| Q[TanStack Query]
  C --> CO[FrameCoalescer<br/>one commit per animation frame]
  CO --> ST[(Zustand stores)]
  ST -->|fine-grained selectors| UI[React components]
  UI -->|shared values| RA[Reanimated<br/>UI thread]
  Q --> UI
```

The same idea appears on both sides of the wire: **keep only the latest state, and let the consumer's pace decide how often it is read**. The gateway conflates Binance's firehose into one slot per pair; the app conflates incoming frames into one React commit per animation frame.

```
apps/gateway/src
  config/        environment schema and typed config
  domain/        pair registry, MarketState (conflating buffer), order book metrics
  ingest/        MarketFeed port, Binance adapter, simulated feed, backoff
  broadcast/     Broadcaster, ClientSession, FrameEncoder, interval maths
  http/          /ws route, /pairs/meta, /health
  observability/ counters and rates

apps/mobile
  app/           expo-router routes only (thin)
  src/core/      stream client, coalescer, stores, API client, gateway config, storage port
  src/features/  markets, favourites, terminal, telemetry, preferences
  src/ui/        theme tokens from the Figma file, shared primitives
  src/lib/       number and time formatting
```

The protocol is documented in [`docs/protocol.md`](docs/protocol.md).

## Buffering strategy

**Conflation, not queues.** Market data is state, not a log: a client that missed three order book snapshots does not want them replayed, it wants the newest one. That makes the safest buffer a buffer of size one.

1. **Ingest: O(1) overwrite.** `MarketState` holds one slot per pair with the latest price, 24 h statistics and order book, plus a sequence number per stream. An update overwrites the slot and bumps the sequence. Memory is O(pairs) whatever the upstream rate.
2. **Derive lazily.** Spread and pressure are computed when a frame is built, once per changed pair per tick, not once per raw message. A book nobody subscribed to is never derived at all.
3. **Serialise once.** `FrameEncoder` caches each pair's JSON fragment keyed by sequence number. A client's frame is assembled by joining cached fragments, so a tick costs roughly "changed pairs", not "changed pairs x clients".
4. **Per-client cursors, no per-client queue.** A `ClientSession` stores only the last sequence it was sent for each pair, its subscriptions and its interval. On its tick it receives the pairs whose sequence moved. Nothing is ever enqueued on a client's behalf.
5. **One shared timer.** Client intervals snap to a 10 ms grid and the broadcaster ticks at their greatest common divisor (100 ms when everyone uses the default), so every client is served exactly on schedule. With no clients the timer stops.

I chose Binance's **partial book depth** stream (`depth20@100ms`) over the diff stream. Each message is a complete top-20 snapshot, so latest-wins conflation is lossless and needs no REST snapshot, sequence validation or resync logic. The cost is depth limited to 20 levels, which is more than the UI shows. Ingestion sits behind a `MarketFeed` port, so a diff-depth adapter can replace it without touching anything downstream.

### Slow consumers

Because there is no per-client queue, the only place bytes can pile up is the socket's own send buffer, and that is policed on every tick:

- `bufferedAmount` above the **high watermark**: the tick is skipped. Cursors do not advance, so when the client drains it receives the newest state rather than a backlog.
- Congested for longer than `CLIENT_MAX_CONGESTION_MS`, or above the **hard limit**: the socket is terminated and its buffers are freed.

Also bounded: inbound payloads (4 KB), connected clients (`MAX_CLIENTS`), invalid messages per client, and liveness via protocol ping/pong.

**Measured** with the simulated feed at about 4,400 raw updates/s, one healthy client, and one client that subscribed to every book at a 10 ms interval and then stopped reading (watermark 64 KB, congestion limit 2 s):

| t (s) | clients | RSS (MB) | ingest/s | frames/s | skipped ticks | evictions |
| ----- | ------- | -------- | -------- | -------- | ------------- | --------- |
| 1     | 2       | 92.8     | 4254     | 71       | 0             | 0         |
| 3     | 2       | 92.9     | 4304     | 96       | 14            | 0         |
| 4     | 2       | 92.9     | 4408     | 25       | 102           | 0         |
| 5     | 1       | 92.9     | 4354     | 10       | 176           | 1         |
| 8     | 1       | 93.0     | 4349     | 10       | 176           | 1         |

Memory stayed flat, the stalled client was evicted 2,001 ms after it first congested with 68 KB buffered, and the healthy client received its 10 frames/s throughout. Against live Binance, about 100 raw updates/s across 24 streams become 10 frames/s per client with 99 to 101 ms between frames.

## Architectural decisions

### Gateway

- **Fastify with `@fastify/websocket`.** `buildApp(config, overrides)` is a composition root with no side effects until `ready`, so the HTTP surface is tested with `inject` and the stream with a real socket on an ephemeral port.
- **Ports at the edges.** `MarketFeed` (Binance or simulated), `StreamSocket` (the four socket methods the broadcaster needs) and an injectable clock. The backpressure tests drive a fake socket's `bufferedAmount` directly.
- **Validate at trust boundaries.** Binance payloads, client messages and environment variables are parsed with zod. Invalid upstream messages are counted and dropped; they never stop the stream.
- **Upstream resilience.** Exponential backoff with full jitter, a handshake timeout, and a silence watchdog that terminates a half-open socket. Upstream health is pushed to clients, so the app can tell "gateway unreachable" from "gateway fine, exchange feed down".
- **Compression is off.** Frames are small, and per-message deflate costs CPU and per-socket memory on both the gateway and the phone.
- **Graceful shutdown.** `SIGINT`/`SIGTERM` stop the feed, close clients with 1001, then close Fastify, with a forced exit after 10 s.

### Mobile

- **Four kinds of state, four owners.** Server cache (REST metadata) in TanStack Query. Live market data in a Zustand store written only by the stream layer. Connection status in its own small store. User preferences (favourites, selected pair, interval) in persisted Zustand stores. Pull-to-refresh calls `refetch()` on the query and cannot touch the socket, because the two never share an owner.
- **The live pipeline.** `onmessage` → `JSON.parse` → `FrameCoalescer` (latest per pair) → one store commit per animation frame → per-row selectors → memoised rows with primitive props. A BTC tick re-renders the BTC row and nothing else. Frames that arrive faster than the display can show (after a JS stall, or at a 10 ms interval) collapse into one render.
- **Animation on the UI thread.** Price flashes and order book depth bars are Reanimated shared values. Depth bars animate `scaleX` with a `transformOrigin`, so there is no layout pass and the animation stays smooth even when the JS thread is busy. Book rows are keyed by rank rather than price, so a bar glides to its new size instead of remounting.
- **Unfocused tabs are frozen** (`freezeOnBlur`). A hidden watchlist does not re-render for ticks nobody can see. The order book is subscribed only while the Terminal tab is focused.
- **`MarketStreamClient` is framework-free.** A state machine (`idle`, `connecting`, `open`, `reconnecting`, `offline`) with jittered backoff, a handshake timeout and an inbound-silence watchdog (React Native cannot observe protocol pongs). It pauses while NetInfo reports no network and retries immediately when it returns, and releases the socket in the background. Subscriptions and the requested interval are desired state, replayed after every `hello`. Having no React dependency is what makes it testable with a fake socket and fake timers.
- **Stream frames skip schema validation on the phone.** They come from our own gateway many times a second; re-proving the shared contract on every frame would spend the JS thread's budget for nothing. REST responses, which are rare, are validated.
- **Hand-rolled number formatting.** The order book formats dozens of cells per frame, so formatting is a `toFixed` plus a grouping pass: cheap, predictable, and independent of the engine's `Intl` implementation.
- **Storage behind one file.** Persisted stores depend on Zustand's `StateStorage` contract; `src/core/storage/app-storage.ts` is the only place that names AsyncStorage.
- **React Compiler is enabled**, with the matching `react-hooks` lint rules. The design does not rely on it: subscriptions are already narrow.

### Monorepo

- **pnpm workspaces and Turborepo**, one TypeScript version (the one Expo SDK 57 ships) pinned through a pnpm catalog, one ESLint flat config (type-aware `typescript-eslint` strict) for every package, and Prettier.
- **`packages/contracts` is consumed as TypeScript source.** Metro and tsx read it directly and tsup inlines it into the gateway bundle, so there is no build step to forget.
- **Supply-chain hygiene.** pnpm 11's release-age cooldown is respected rather than bypassed: three dependencies are pinned one patch behind because their newest release was under a day old. Install scripts are explicitly allowed (`esbuild`) or denied (`unrs-resolver`).

## Performance notes

The Telemetry tab exists to make the system observable, and it changed my conclusions during development:

- On my Android emulator the JS frame rate read about 20 FPS. Before optimising anything I measured a baseline with Android's own tooling (`dumpsys gfxinfo`): the **stock Settings app on the same emulator had a 34 ms median frame time** (about 29 FPS) with a 20 ms GPU median. The ceiling was the emulator on a loaded laptop.
- With the gateway stopped, so **zero messages and zero commits**, the app read 15 FPS and 151 ms event-loop lag. Under live load it read 31 FPS and 92 ms. Idle was worse than busy, which confirms those two numbers describe the device, not the app's workload.
- That is why the health badge is not based on frame rate or lag. It reports the share of received frames the UI had to coalesce before applying them, which is a property of this app and is directly fixable with the interval slider on the same screen. At 100 ms the app applied 9 of every 10 frames individually.
- Freezing unfocused tabs raised the live figure from 22 to 31 FPS on that emulator.

Judge real performance on a physical device or a release build. Expo Go in development mode runs an unoptimised bundle.

## Requirement coverage

| Requirement                                                    | Where                                                                         |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Multiple pairs, 5 minimum                                      | `domain/pairs.ts`, `PAIRS` env (8 by default)                                 |
| Ingest order book updates                                      | `ingest/binance/` (`depth20@100ms`, `aggTrade`, `ticker`)                     |
| Buffer/batch, configurable interval (100 ms)                   | `domain/market-state.ts`, `broadcast/broadcaster.ts`, `BROADCAST_INTERVAL_MS` |
| Slow consumers cannot grow memory                              | `Broadcaster.isCongested`, tested in `broadcaster.test.ts`                    |
| WebSocket server, pair-tagged payloads                         | `http/stream-route.ts`, [`docs/protocol.md`](docs/protocol.md)                |
| `GET /pairs/meta`                                              | `http/pairs-meta-route.ts`                                                    |
| Watchlist: pair, price, 24 h change, live indicator, favourite | `features/markets/market-row.tsx`                                             |
| Search                                                         | `features/markets/filter-pairs.ts`, `search-field.tsx`                        |
| Favourites persisted and restored                              | `features/favourites/favourites-store.ts`                                     |
| Details: price, pressure, spread, order book, last updated     | `features/terminal/`                                                          |
| Green/red price highlight                                      | `ui/flashing-price.tsx`                                                       |
| Order book volume animates smoothly                            | `features/terminal/order-book-row.tsx`                                        |
| Offline: status, last data, auto reconnect                     | `core/stream/market-stream-client.ts`, `ui/connection-banner.tsx`             |
| Pull-to-refresh without interrupting the stream                | `features/markets/markets-screen.tsx`                                         |

Each of these was exercised on the Android emulator: live prices and flashes, search, a favourite surviving a cold restart, the order book and depth chart, the slider changing the gateway's cadence for that client (9 frames/s down to 2 and back), a gateway stop producing the banner with retained data, recovery within about 2 s of the gateway returning, and a pull-to-refresh during which the gateway logged no reconnect. The app was also launched on the iOS simulator, where it connected and streamed.

## Assumptions

- The gateway runs on the developer's machine and is reached over the LAN or the emulator's host alias, so plain `ws://` and `http://` are acceptable. Cleartext is enabled explicitly for Android release builds and limited to local networking on iOS.
- "Current price" is the last trade price (`aggTrade`), refreshed by the 24 h ticker when no trade has occurred.
- "Buy/sell pressure" is order book imbalance: each side's share of resting quantity across the visible 20 levels.
- `/pairs/meta` may be mocked, so names, precision and trading status come from a static registry. The 24 h high, low and volume are real values from the ticker stream.
- The per-row "live connection indicator" means: the socket is open, the gateway reports the exchange feed as live, and that pair has received data.
- A single gateway process serves a handful of clients. Horizontal scaling is out of scope.
- No authentication: the data is public and the brief does not ask for it.

## Trade-offs

| Decision                                                      | Gained                                                                   | Given up                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Conflation instead of queues                                  | Bounded memory, always-fresh data, trivial slow-consumer handling        | Clients never see intermediate states. Correct for a viewer, wrong for anything that must see every event                                 |
| Partial depth instead of diff depth                           | No snapshot or resync logic, lossless conflation                         | Depth capped at 20 levels                                                                                                                 |
| JSON text frames                                              | Debuggable, zero client dependencies, fragments can be cached as strings | Larger than a binary encoding. At about 4 KB/s per client this is not the bottleneck                                                      |
| Two channels instead of one payload per pair                  | The phone parses only what is on screen                                  | Slightly more protocol than the brief's example                                                                                           |
| Expo Go compatible dependencies only (AsyncStorage, not MMKV) | Reviewers run the app with no native build                               | MMKV's synchronous speed, which a handful of favourites does not need                                                                     |
| No schema validation of stream frames on the phone            | JS thread headroom                                                       | A gateway bug would surface as a rendering error instead of a parse error. The shared contract package and the gateway's tests cover this |
| One ESLint config without `eslint-config-expo`                | One supported ESLint major (10) and one rule set across the workspace    | Expo's preset, whose plugin chain does not support ESLint 10 yet                                                                          |
| Order book rows re-render through React                       | Simple, readable components                                              | A few more renders than writing text from the UI thread. Rows are memoised on primitive props, so only changed levels render              |

**With more time:** a diff-depth feed for a deeper book, MessagePack frames behind a negotiated `hello` capability, end-to-end tests with Maestro, persisting the query cache so a cold start with the gateway down still lists pairs, and per-client metrics on `/health`.

## Deviations from the mockup

The Figma file contains a Trading Terminal screen, a Telemetry & Settings screen and a design-system sheet. Colours, fonts (Hanken Grotesk, Inter, JetBrains Mono), type scale, spacing, row heights and the tab bar follow it.

- **There is no watchlist mockup.** The Markets screen is designed from the design-system sheet: its search field, button styles and status pill.
- **Three tabs instead of four.** The mockup's separate Settings tab has no screen of its own; its content is the combined "System Settings & Telemetry" screen.
- **The terminal adds a pressure strip** (spread, buy/sell pressure, last updated). The brief requires these values; the mockup only hints at them inside the depth legend. "Market cap" is replaced by 24 h volume, which the feed actually provides.
- **Telemetry shows only measured values.** The update-frequency slider is real and drives a per-client throttle on the gateway. JS frame rate, message rate, commits, coalesced frames, throughput, round trip and heap are measured. The mockup's fictional items are omitted: binary compression and adaptive polling toggles, GPU/WebGL, IndexedDB, and the account drawer with API keys and sign out.

## How AI-assisted tools were used

I used **Claude Code** (Anthropic's CLI agent) throughout, as a pair programmer that I directed and reviewed.

- **Reading the brief and the design.** The `.fig` file is a binary format. Claude wrote a small decoder for Figma's kiwi schema to extract the exact layer tree, colours, fonts and sizes, which is where the theme tokens come from and how the missing watchlist screen was noticed.
- **Planning before code.** I set the constraints (Fastify, the latest Expo SDK, a monorepo, senior-level conventions, minimal comments). Claude produced an implementation plan; I made the open decisions (Expo Go compatibility, how much of the mockup to build, how to handle Android tooling) and approved the plan before any code was written.
- **Implementation and tests.** Claude wrote the code and the 114 tests in small commits, running lint, typecheck and tests after each step. Current package versions and Expo/Binance behaviour were checked against npm and the official docs rather than assumed.
- **Verification on real targets.** Claude ran the gateway against live Binance, load-tested it with the simulated feed and a deliberately stalled client, and drove the app on the Android emulator through `adb`. That surfaced real defects that were then fixed: an Android text-clipping bug, a telemetry sampler that read its counters inside a lazy state updater, a flush deadline measured from connect time instead of send time, and hidden tabs re-rendering on every tick.
- **Measuring instead of guessing.** When the frame-rate gauge read low, the first step was a baseline of a stock Android app on the same emulator rather than an optimisation pass. See [Performance notes](#performance-notes).

What I take responsibility for: the architecture and its trade-offs as described here, the scope decisions, and the review of the resulting code.
