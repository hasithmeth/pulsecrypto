# PulseCrypto

A real-time cryptocurrency market viewer.

- **`apps/gateway`**: a Node.js (Fastify) market-data gateway. It ingests Binance's public streams, conflates them, and broadcasts the latest state to authenticated clients at a configurable interval (default 100 ms). It also holds user accounts and each user's settings.
- **`apps/mobile`**: a React Native (Expo SDK 57) app built to the supplied Figma design: trading terminal with a live order book and depth chart, markets watchlist with search and favourites, telemetry, settings, a side drawer, and sign in / sign up.
- **`packages/contracts`**: the wire protocol and API shapes, shared by both as zod schemas and inferred types.

> Screen recording: _add link here_

## Contents

1. [Quick start](#quick-start)
2. [Build, run and test](#build-run-and-test)
3. [Architecture](#architecture)
4. [Buffering strategy](#buffering-strategy)
5. [Accounts and per-user settings](#accounts-and-per-user-settings)
6. [Binary protocol and adaptive polling](#binary-protocol-and-adaptive-polling)
7. [Architectural decisions](#architectural-decisions)
8. [Performance notes](#performance-notes)
9. [Requirement coverage](#requirement-coverage)
10. [Assumptions](#assumptions)
11. [Trade-offs](#trade-offs)
12. [Design fidelity](#design-fidelity)
13. [How AI-assisted tools were used](#how-ai-assisted-tools-were-used)

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

On first launch, choose **Create an account**. Accounts live in `apps/gateway/data/users.json` (gitignored), so they survive gateway restarts; delete that file to start fresh. No secrets are needed for development. In production the gateway refuses to start without `AUTH_SECRET`.

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
pnpm test                                   # tests only (180 across the workspace)
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
  AU[Auth API<br/>scrypt, JWT, user store] -->|verifies token| BR
  BR -->|WebSocket /ws<br/>JSON or MessagePack| C[MarketStreamClient<br/>auth, state machine, backoff, watchdog]
  R -->|HTTP| Q[TanStack Query]
  AU <-->|login, /me/settings| SS[Session + settings sync]
  SS --> ST
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
  auth/          user repository port, file-backed store, scrypt hashing, auth service
  domain/        pair registry, MarketState (conflating buffer), order book metrics
  ingest/        MarketFeed port, Binance adapter, simulated feed, backoff
  broadcast/     Broadcaster, ClientSession, FrameEncoder, interval maths
  http/          /ws route, auth and settings routes, /pairs/meta, /health, error envelope
  observability/ counters and rates

apps/mobile
  app/           expo-router routes only (thin)
  src/core/      stream client, coalescer, adaptive controller, stores, API client, storage port
  src/features/  auth, settings (per-user store and sync), markets, terminal, telemetry
  src/ui/        tokens and icons exported from Figma, header, tab bar, drawer, controls
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

## Accounts and per-user settings

- **Sign up and sign in** with email and password. Passwords are hashed with scrypt (per-user salt, parameters stored in the hash so they can be raised later) and compared in constant time. A login for an unknown email still pays for a hash comparison against a decoy, and both failures return the same response, so neither timing nor wording reveals which addresses exist.
- **Sessions are JWTs** (`@fastify/jwt`), 7 days by default. There are no refresh tokens; see trade-offs. The credential routes are rate limited (`@fastify/rate-limit`), request bodies are capped at 16 KB, and every error leaves the gateway in one envelope, `{ "error": { "code", "message" } }`, so the app branches on codes, never on prose.
- **The stream requires the token.** The first WebSocket message must be `auth`; nothing, not even `hello`, is sent before it, and a socket that stays silent is closed after 5 s. The token travels in a message rather than the URL so it never lands in access logs.
- **Storage sits behind a `UserRepository` port.** The shipped adapter is a JSON file written atomically (temp file plus rename, mode `0600`, writes serialised). It suits a local gateway and a database can replace it without touching the service or routes.
- **Settings belong to the user, not the device.** Favourites, selected pair, stream interval, binary protocol and adaptive polling are stored on the gateway (`GET`/`PUT /me/settings`) and cached on the device under a key that includes the user id. On sign-in the cache is applied first, so the app works offline, then the server copy wins. Edits are debounced into one write, and a failed write is retried when the socket reconnects. Signing out closes the sync, resets the store and stops the stream, so the next user starts clean. Verified on the emulator with two accounts: each kept its own favourites and toggles across sign-out and sign-in.
- **On the phone the token lives in the Keychain / Keystore** (`expo-secure-store`), not AsyncStorage. A stored session is trusted at launch without a network call, so the app opens offline; a 401 from the API or a 4003 close from the stream signs the user out.

## Binary protocol and adaptive polling

Both are toggles in the design's Data Throttling card, and both are real.

**Binary Protocol Compression** switches market frames from JSON text to MessagePack. Control messages stay JSON, so the client decodes by frame type (text or binary) with no negotiation state. The gateway keeps its serialise-once property: each pair is packed once per change, and frames are assembled by writing the MessagePack map and array headers by hand around the cached element buffers. Measured against live Binance:

| Frame content                 | JSON    | MessagePack | Saving |
| ----------------------------- | ------- | ----------- | ------ |
| 8 tickers + one 20-level book | 1,202 B | 1,104 B     | 8%     |
| Tickers only (watchlist)      | 409 B   | 254 B       | 38%    |

Books save less because a float64 costs 9 bytes either way. The cost is decoding in JavaScript instead of Hermes' native `JSON.parse`; at 10 frames/s the app held 60 FPS with it on. It defaults to on, matching the state the design depicts.

**Adaptive Polling Strategy** lets the app slow the stream when the UI falls behind. Once a second it looks at the share of received frames that had to be coalesced before React could apply them. Above 20% for three samples it asks the gateway for a 1.5x longer interval; after ten healthy samples it steps back towards the interval the user chose, never below it. Fast back-off with slow recovery is the asymmetry congestion control uses, so the interval settles instead of oscillating. The slider shows the interval the gateway acknowledged: with the slider at 10 ms and the toggle on, the emulator settled at 20 ms while the thumb stayed at 10 ms.

## Architectural decisions

### Gateway

- **Fastify with `@fastify/websocket`.** `buildApp(config, overrides)` is a composition root with no side effects until `ready`, so the HTTP surface is tested with `inject` and the stream with a real socket on an ephemeral port.
- **Ports at the edges.** `MarketFeed` (Binance or simulated), `StreamSocket` (the four socket methods the broadcaster needs) and an injectable clock. The backpressure tests drive a fake socket's `bufferedAmount` directly.
- **Validate at trust boundaries.** Binance payloads, client messages and environment variables are parsed with zod. Invalid upstream messages are counted and dropped; they never stop the stream.
- **Upstream resilience.** Exponential backoff with full jitter, a handshake timeout, and a silence watchdog that terminates a half-open socket. Upstream health is pushed to clients, so the app can tell "gateway unreachable" from "gateway fine, exchange feed down".
- **Compression is off.** Frames are small, and per-message deflate costs CPU and per-socket memory on both the gateway and the phone.
- **Graceful shutdown.** `SIGINT`/`SIGTERM` stop the feed, close clients with 1001, then close Fastify, with a forced exit after 10 s.

### Mobile

- **Five kinds of state, five owners.** Server cache (REST metadata) in TanStack Query. Live market data in a Zustand store written only by the stream layer. Connection status in its own small store. The session in an auth store backed by secure storage. User settings in one store that the sync layer loads, caches and pushes per user. Pull-to-refresh calls `refetch()` on the query and cannot touch the socket, because the two never share an owner.
- **The live pipeline.** `onmessage` → decode (`JSON.parse` for text frames, MessagePack for binary) → `FrameCoalescer` (latest per pair) → one store commit per animation frame → per-row selectors → memoised rows with primitive props. A BTC tick re-renders the BTC row and nothing else. Frames that arrive faster than the display can show (after a JS stall, or at a 10 ms interval) collapse into one render.
- **Animation on the UI thread.** Price flashes and order book depth bars are Reanimated shared values. Depth bars animate `scaleX` with a `transformOrigin`, so there is no layout pass and the animation stays smooth even when the JS thread is busy. Book rows are keyed by rank rather than price, so a bar glides to its new size instead of remounting.
- **Unfocused tabs are frozen** (`freezeOnBlur`). A hidden watchlist does not re-render for ticks nobody can see. The order book is subscribed only while the Terminal tab is focused.
- **`MarketStreamClient` is framework-free.** A state machine (`idle`, `connecting`, `open`, `reconnecting`, `offline`) with jittered backoff above a 1.2 s floor, a handshake timeout and an inbound-silence watchdog (React Native cannot observe protocol pongs). It pauses while NetInfo reports no network and retries immediately when it returns, and releases the socket in the background. Subscriptions and the requested interval are desired state, replayed after every `hello`. Having no React dependency is what makes it testable with a fake socket and fake timers. The retry floor exists because React Native on iOS drives timers shorter than a second from the display link, which does not tick while the screen is static on a headless simulator: a first retry of under 500 ms never fired there and the app sat on RETRYING until it was touched. Longer timers use a native timer and always fire.
- **Stream frames skip schema validation on the phone.** They come from our own gateway many times a second; re-proving the shared contract on every frame would spend the JS thread's budget for nothing. REST responses, which are rare, are validated.
- **Hand-rolled number formatting.** The order book formats dozens of cells per frame, so formatting is a `toFixed` plus a grouping pass: cheap, predictable, and independent of the engine's `Intl` implementation.
- **Storage behind one file.** The settings cache depends on Zustand's `StateStorage` contract; `src/core/storage/app-storage.ts` is the only place that names AsyncStorage.
- **One typography scale, two text engines.** The design sets many line heights at or below the font size (labels 11/11, numbers 14/14). Android honours that once its font padding is off. iOS only centres glyphs when the line box is at least the font's natural height (1.21x for Inter, 1.32x for JetBrains Mono, read from the fonts' `hhea` tables); in a shorter box all the overflow goes upward, so labels rode up into the icons and values above them. On iOS the tokens therefore keep the natural line box and use negative margins to shrink the layout footprint back to the design's. Screens never branch on platform; `src/ui/theme.ts` is the only place that knows.
- **Figma strokes sit inside the box.** A 25pt inset in Figma is a 1pt border plus 24pt of padding, not 25 plus 1. Cards, badges, the depth overlay, section headers and the drawer follow that rule.
- **Design assets are the real ones.** Icons are the SVG paths exported from Figma, generated into one typed component with the path data untouched. Typography tokens carry the exact weights, sizes, line heights and tracking of the Figma text styles.
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
- In a later session, with the laptop less loaded, the same emulator and the same code read a steady 60 FPS under live load. Same app, different host conditions, which is the point of the baseline above.

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
| Favourites persisted and restored                              | `features/settings/` (per user, on the gateway and cached on the device)      |
| Details: price, pressure, spread, order book, last updated     | `features/terminal/` (stats strip, order book, depth overlay)                 |
| Green/red price highlight                                      | `ui/flashing-price.tsx`                                                       |
| Order book volume animates smoothly                            | `features/terminal/order-book-row.tsx`                                        |
| Offline: status, last data, auto reconnect                     | `core/stream/market-stream-client.ts`, status in `ui/app-header.tsx`          |
| Pull-to-refresh without interrupting the stream                | `features/markets/markets-screen.tsx`                                         |

Each of these was exercised on the Android emulator: live prices and flashes, search, a favourite surviving a cold restart, the order book and depth chart, the slider changing the gateway's cadence for that client (9 frames/s down to 2 and back), a gateway stop flipping the header status to RECONNECTING while the last data stayed on screen, recovery within about 2 s of the gateway returning, and a pull-to-refresh during which the gateway logged no reconnect. On the iOS simulator every screen was compared with the design, and sign up, sign in, streaming, favourites and an untouched reconnect after a gateway outage were verified.

## Assumptions

- The gateway runs on the developer's machine and is reached over the LAN or the emulator's host alias, so plain `ws://` and `http://` are acceptable. Cleartext is enabled explicitly for Android release builds and limited to local networking on iOS.
- "Current price" is the last trade price (`aggTrade`), refreshed by the 24 h ticker when no trade has occurred.
- "Buy/sell pressure" is order book imbalance: each side's share of resting quantity across the visible 20 levels.
- `/pairs/meta` may be mocked, so names, precision and trading status come from a static registry. The 24 h high, low and volume are real values from the ticker stream.
- The per-row "live connection indicator" means: the socket is open, the gateway reports the exchange feed as live, and that pair has received data.
- A single gateway process serves a handful of clients. Horizontal scaling is out of scope.
- Accounts are an addition beyond the brief. Market data itself is public, so authentication protects per-user settings and gates the stream, not the data.
- Market capitalisation is indicative: Binance publishes no supply data, so the registry holds an approximate circulating supply per coin and the app multiplies it by the live price.
- The drawer's API Keys, Security, Trade History and Support entries have no designed destinations. They are rendered exactly as drawn, including Trade History's highlighted state, and announced as unavailable. Only Sign Out acts.
- The header's sensors button pauses and resumes the live stream; the status label then reads PAUSED.
- "Tier 3 Verified" in the drawer is the design's literal copy, shown beside the user's real account ID.

## Trade-offs

| Decision                                                      | Gained                                                                  | Given up                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Conflation instead of queues                                  | Bounded memory, always-fresh data, trivial slow-consumer handling       | Clients never see intermediate states. Correct for a viewer, wrong for anything that must see every event                                 |
| Partial depth instead of diff depth                           | No snapshot or resync logic, lossless conflation                        | Depth capped at 20 levels                                                                                                                 |
| JSON on the wire by default, MessagePack on request           | Debuggable frames for any client, control messages readable in any tool | Two encoders to keep in step. The binary saving is modest for books (8%) because float64 levels dominate                                  |
| Two channels instead of one payload per pair                  | The phone parses only what is on screen                                 | Slightly more protocol than the brief's example                                                                                           |
| Expo Go compatible dependencies only (AsyncStorage, not MMKV) | Reviewers run the app with no native build                              | MMKV's synchronous speed, which a handful of favourites does not need                                                                     |
| No schema validation of stream frames on the phone            | JS thread headroom                                                      | A gateway bug would surface as a rendering error instead of a parse error. The shared contract package and the gateway's tests cover this |
| One ESLint config without `eslint-config-expo`                | One supported ESLint major (10) and one rule set across the workspace   | Expo's preset, whose plugin chain does not support ESLint 10 yet                                                                          |
| Order book rows re-render through React                       | Simple, readable components                                             | A few more renders than writing text from the UI thread. Rows are memoised on primitive props, so only changed levels render              |

**With more time:** a diff-depth feed for a deeper book, scaled-integer book levels to make binary frames much smaller, refresh tokens with server-side revocation, end-to-end tests with Maestro, persisting the query cache so a cold start with the gateway down still lists pairs, and per-client metrics on `/health`.

## Design fidelity

The UI is built from the Figma file itself, read through Figma's developer tooling: exact text styles, colours, spacing and the SVG icon assets. Header, tab bar (four tabs with the scaled active pill), side drawer, price ticker, order book, depth chart with its overlay, the throttling card with its custom slider and toggles, the performance dashboard, and the three micro-cards follow their Figma nodes. Each was compared side by side with the Figma render on the Android emulator and on the iOS simulator.

Where the app departs from the design, it is deliberate:

- **Brief-only values live in the stats strip.** The design's 24H HIGH / 24H LOW / MARKET CAP row is a horizontal scroller in Figma. SPREAD, BUY PRESSURE, SELL PRESSURE and LAST UPDATED are appended as further cells in the identical style, so the screen matches the design at rest and the brief's values are one swipe away. The depth overlay's LIQUIDITY GAP and PRESSURE are live.
- **Screens the design does not contain.** Markets (required by the brief), Sign in and Sign up are composed from the design system only: the same header, the sheet's search field and button styles, the same typography.
- **The Telemetry tab** has no screen of its own in Figma. It shows only the Settings design's telemetry blocks: the Performance Dashboard and the three micro-cards.
- **Fictional copy is replaced by real values, layout unchanged.** GPU ACCELERATION reports the UI-thread animation pipeline (there is no WebGL in React Native), API LATENCY shows the measured average ping to the gateway, STORAGE CACHE shows real on-device storage use (there is no IndexedDB), and the memory graph plots the real JS heap.
- **One header, not two.** Figma's two headers disagree on the menu button (34pt with 8pt padding on the Terminal, 26pt with 4pt on Settings), which made the hamburger jump 4pt when switching tabs. The Terminal's metrics are used on every screen; the title sits at the same x in both designs either way.
- **The depth chart is drawn from live data**, not the mockup's static image: smooth monotone curves that cannot overshoot, with the spread at the exact centre as designed. Levels are spaced by rank, because on a price axis twenty levels within a few cents collapse into a sliver.

## How AI-assisted tools were used

I used **Claude Code** (Anthropic's CLI agent) throughout, as a pair programmer that I directed and reviewed.

- **Reading the brief and the design.** The `.fig` file is a binary format. Claude wrote a small decoder for Figma's kiwi schema to extract the exact layer tree, colours, fonts and sizes, which is where the theme tokens come from and how the missing watchlist screen was noticed.
- **Planning before code.** I set the constraints (Fastify, the latest Expo SDK, a monorepo, senior-level conventions, minimal comments). Claude produced an implementation plan; I made the open decisions (Expo Go compatibility, how much of the mockup to build, how to handle Android tooling) and approved the plan before any code was written.
- **Implementation and tests.** Claude wrote the code and the 180 tests in small commits, running lint, typecheck and tests after each step. Current package versions and Expo/Binance behaviour were checked against npm and the official docs rather than assumed.
- **Verification on real targets.** Claude ran the gateway against live Binance, load-tested it with the simulated feed and a deliberately stalled client, and drove the app on the Android emulator through `adb`. That surfaced real defects that were then fixed: an Android text-clipping bug, a telemetry sampler that read its counters inside a lazy state updater, a flush deadline measured from connect time instead of send time, hidden tabs re-rendering on every tick, and a first reconnect attempt that never fired on an idle iOS simulator.
- **Design review against the real Figma file.** The first build worked from a decoded layer tree that could not be rendered, and I found it had drifted from the design: regular instead of bold weights, lookalike icons, a missing drawer, tab and toggles. I gave Claude the live Figma file and my list of defects. It pulled exact styles and SVG assets through Figma's developer tooling, produced a gap analysis that added further drifts to my list, asked me to decide the places where the design and the brief conflict, and then rebuilt the UI and compared each region with the Figma render on the emulator.
- **Accounts.** I asked for login and per-user settings; the security choices (scrypt, constant-time comparison, no user enumeration, token in a message rather than the URL, secure storage on device) were proposed by Claude and reviewed by me.
- **Measuring instead of guessing.** When the frame-rate gauge read low, the first step was a baseline of a stock Android app on the same emulator rather than an optimisation pass. See [Performance notes](#performance-notes).

What I take responsibility for: the architecture and its trade-offs as described here, the scope decisions, and the review of the resulting code.
