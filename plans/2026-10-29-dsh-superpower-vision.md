# dsh-superpower-vision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan one module at a time with a human gate. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a DSH Desktop plugin that visualizes the superpowers skill ecosystem, the plugin registry, the KB memory-reuse library, the evolution-memory spool, and agent toolkits — with reserved read/write/toolkit adapter interfaces.

**Architecture:** Host half (`index.js` + `lib/collectors` + `lib/adapters` + `lib/snapshot.js`) aggregates data and serves it over a top-level `webServer` exact route `/dsh-superpower-vision/snapshot`; client half (`lib/client.js`, hand-written CJS factory) polls that route and renders five tabs into `settings.section`, a summary card into `plugins.item`, and a quick-peek overlay into `shell.overlay`. All external data sources sit behind adapter contracts with Null defaults.

**Tech Stack:** Node ESM host (Node 22+/24, desktop harness runtime), hand-written CJS client factory + React 18 via `require`, `yaml` ^2.4.2 for patch parsing, `node --test` for host tests.

**Spec:** `specs/2026-10-29-dsh-superpower-vision-design.md`

## Global Constraints

- Plugin id / package name / settings namespace = `dsh-superpower-vision`; settings nav id = `superpower-vision`; `plugins.item` id = `dsh-superpower-vision`; locale NS = `dsh-superpower-vision`. loader entry id must equal cordis.patch.yml insert id verbatim.
- Manifest: `dsh.bundle.patch: "./cordis.patch.yml"`; `dsh.client: { platform: "web", inject: ["@deepseek-ai/dsh-client-locale","@deepseek-ai/dsh-client-ui-slots","@deepseek-ai/dsh-client-ui-settings","@deepseek-ai/dsh-client-ui-plugin-manager","@deepseek-ai/dsh-client-ui-layout"] }` (deps required to declare the three target slots; verified against dsh-api-pool + dsh-function-preview manifests).
- NO routes under `/api/` (desktop 405). Data route is top-level exact path `/dsh-superpower-vision/snapshot`; client fetches with `credentials: 'same-origin'`, `cache: 'no-store'`.
- `settings.section` registration must NOT be wrapped in `whileServed`; `plugins.item` MAY be (dsh-api-pool precedent). No early `return` before slot registration when `configForms.get` fails — degrade and continue.
- Client CSS: inject `style[data-plugin-css="dsh-superpower-vision/<file>"]`; tokens only `var(--dsw-alias-*)`, `var(--dsw-font-*)`; `prefers-reduced-motion` guard; errors with `role="alert"`.
- i18n: `locale/zh.json` + `locale/en.json`, registered via `ctx.locale.register(NS, { zh, en })`; components read `props.t('key')`.
- Host events: `ctx.on('session/event', (session, event) => ...)` (event.type `assistant/message`|`assistant/attempt` = settlement); `ctx.on('session/disposed', (session) => ...)` for evolution trigger; `ctx.on('skills/change', ...)` invalidates snapshot cache.
- kb-mcp row (source of truth, desktop profile patch): `serverName: anything-kb`, `command: '/Applications/AnyThingKB.app/Contents/MacOS/kb-mcp'`, `env.ANYTHING_KB_DEFAULT_OPERATOR: 'ai:mcp:dsh'`. Parse from `profiles/web/cordis.patch.yml`; never hard-code in client.
- peerDependencies: `@deepseek-ai/cordis ^4.0.1`, `@deepseek-ai/dsh-client-ui-primitives`, `-renderer`, `-settings`, `-plugin-manager`, `-layout`, `-locale` (`>=0.2.0-rc.1 <0.3.0-0`), `@deepseek-ai/dsh-skill (>=0.1.0-rc.1 <0.3.0-0)`, `@deepseek-ai/schemastery ^3.18.4`, `react ^18.2.0`; dependencies: `yaml ^2.4.2`.
- Version bumps are mandatory before every reinstall (generation id collision). `scripts/install-local.mjs` refuses to install a generation id already in `desired.json` unless `--force`.
- No git commit until operator explicitly asks (house rule). Commit steps below are deferred to P6.
- Overlay deviation (recorded call): `{project}-{version}/Resource|Release` wrappers are NOT used — the package root is the install unit; built `.tgz` goes to `Release/`. Rationale logged in `log/decisions.md`.

## Review Focus

- `dsh-client-ui-plugin-manager` / `-ui-slots` are not in install roots (they live in app.asar, provided at runtime by DSH Desktop 0.12.0): if a slot registration throws, log and continue — `settings.section` is the guaranteed entry.
- kb-mcp may be missing/misconfigured: every prep-memory call must degrade to `{ ok: false, reason }` and the Memory tab renders an "未接入" state — never throw into the route handler.
- Evolution auto-ingest must be throttled (one record per session id, in-memory set) and must never write with status APPROVED (MCP ingest is PENDING by contract).
- Install reminder: after every install, the operator must restart DSH Desktop; scripts print it.
- The desktop profile patch has an `ANYTHING-KB-MANAGED-BLOCK` — parse defensively; unknown YAML shapes degrade to empty rows.

---

### Task 1: Plugin skeleton + manifest + install scaffolding

**Files:**
- Create: `package.json`, `cordis.patch.yml`, `index.js`, `lib/client.js`, `locale/zh.json`, `locale/en.json`, `icon.svg`, `temp/{uncertain,expired,subagent-logs,code,other}/.gitkeep`, `log/decisions.md`
- Test: `tests/manifest.test.mjs`

**Functional view:** A loadable plugin package exists with correct manifest, cordis patch row, locale files, and a stub client factory that registers an empty settings section — install script chain accepts it (verified in Task 2).

**Logic:** Host entry exports `name`/`inject`/`Config`/`apply`; `apply` logs one line. Client factory registers `settings.section` (id `superpower-vision`, order 60) with a placeholder panel and registers locale dictionaries. Config schema declares the three volatile fields the later tasks write: `evolutionAuto` (default true), `kbServer` (default `'anything-kb'`), `snapshotTtlMs` (default 2000).

**API reserved:** `buildSnapshot`, `createAdapterRegistry`, collectors — referenced by later tasks only.

**Where next connects:** Task 2 installs this package; Tasks 3–8 fill host `lib/`; Task 9 replaces the placeholder panel.

**Interfaces:**
- Consumes: nothing.
- Produces: `package.json` (name `dsh-superpower-vision`, version `0.1.0`), `cordis.patch.yml` (`- insert: - id: dsh-superpower-vision`), `index.js` exports `{ name: 'dsh-superpower-vision', inject: ['webServer','skills','sessions'], Config, apply }`, `lib/client.js` (`window.__ModuleLoader__.load({ id: 'dsh-superpower-vision', factory })`, `exports.apply`, `exports.inject = ['slots','locale','configForms']`), `locale/zh.json`, `locale/en.json`.

- [ ] **Step 1: Write the failing test** `tests/manifest.test.mjs`: read `package.json` and `cordis.patch.yml`; assert `pkg.dsh.bundle.patch === './cordis.patch.yml'`, `pkg.dsh.client.inject` contains the five Global-Constraints packages, `pkg.dependencies.yaml === '^2.4.2'`, `pkg.peerDependencies['react'] === '^18.2.0'`; assert patch YAML text matches `/- insert:/` and `/id:\s*dsh-superpower-vision/`; assert `locale/zh.json` and `locale/en.json` parse and both contain the same key set.
- [ ] **Step 2: Run test to verify it fails** — `node --test tests/manifest.test.mjs` → FAIL (files missing).
- [ ] **Step 3: Create the files** — manifest per Interfaces; `index.js` minimal apply with `ctx.logger?.info?.('dsh-superpower-vision: host loaded')`; `lib/client.js` factory skeleton with `zh`/`en` dictionaries (placeholder keys `nav`, `title`, `loading`), CSS string with `data-plugin-css` id, locale register, `settings.section` registration (order 60, label `emit(ctx.locale.bind(NS), 'nav')`), placeholder panel component; `icon.svg` simple glyph; `temp/` `.gitkeep` files; `log/decisions.md` recording the overlay deviation + decisions D1–D7 pointer to spec.
- [ ] **Step 4: Run test to verify it passes** — same command → PASS.
- [ ] **Step 5: Host-load smoke check** — `node -e "import('./index.js').then(m => console.error(typeof m.apply === 'function' && m.name === 'dsh-superpower-vision' ? 'host-ok' : 'host-bad'))"` → prints `host-ok`. (Commit deferred — operator rule.)

### Task 2: Install / uninstall scripts (generation channel)

**Files:**
- Create: `scripts/install-local.mjs`, `scripts/uninstall-local.mjs`
- Test: `tests/install-script.test.mjs`

**Functional view:** `node scripts/install-local.mjs` installs the package into DSH Desktop generations and projects it; `node scripts/uninstall-local.mjs` removes it from `desired.json` and re-projects; both print the restart reminder. A repeat install with an unchanged version is refused unless `--force`.

**Logic:** Port dsh-purge-preset's scripts verbatim-in-structure: locate `dsh-desktop-market-installer/generations/*.mjs` under `DSH_DESKTOP_APP` (default `/Applications/DSH Desktop.app/Contents/Resources/app`); `installGeneration({dshHome, profile:'web', pluginSpec: sourceDirectory, ...})`; `verifyGenerationPeers`; `writeDesired` (replace any existing `dsh-superpower-vision+*` ids); `projectGenerations(dshHome, 'web')` (positional args). `install-local.mjs` reads `desired.json` first and aborts with "bump version or pass --force" when the identical generation id is already desired.

**API reserved:** none.

**Where next connects:** Used by Task 10 verification and by the operator for every reinstall.

**Interfaces:**
- Consumes: Task 1 `package.json` (`name`, `version`).
- Produces: two scripts; `tests/install-script.test.mjs` asserts both files contain the required calls (`installGeneration`, `projectGenerations(dshHome, PROFILE)` positional form, `--force` guard) and refuse-guard text.

- [ ] **Step 1: Write the failing test** — grep-level assertions on both scripts (read file text): contains `installGeneration(`, `projectGenerations(DSH_HOME, PROFILE)`, `writeDesired`, `disableGeneration`, `--force`, and the reminder string `重启 DSH Desktop`.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/install-script.test.mjs`.
- [ ] **Step 3: Write both scripts** — adapt from `/Users/yin/Desktop/dsh-Plugins/dsh-purge-preset/scripts/{install,uninstall}-local.mjs` with: duplicate-generation guard, profile patch sanity check for a stale hand-written `id: dsh-superpower-vision` row (warn only), restart reminder lines.
- [ ] **Step 4: Run to verify PASS** — same command.
- [ ] **Step 5: Dry-run parse check** — `node --check scripts/install-local.mjs && node --check scripts/uninstall-local.mjs` → no output (syntax OK).

### Task 3: Host collectors — skills / plugins / mcp-rows

**Files:**
- Create: `lib/collectors/skills.js`, `lib/collectors/plugins.js`, `lib/collectors/mcp-rows.js`
- Test: `tests/collectors.test.mjs`

**Functional view:** Given a live `ctx.skills` and the desktop harness home, the host produces the three raw datasets the snapshot needs: skill entries (registry + on-disk, with drift flags), plugin registry (desired ids, generations, patch rows), and MCP server rows.

**Logic:** `collectSkills(ctx, { harnessHome })` calls `await ctx.skills.list({})` (options optional per host contract), normalizes each entry to `{ name, provider, source, rank, modelInvocable, userInvocable, locator }` (invocation defaults `{modelInvocable:true,userInvocable:true}` when absent), then scans `harnessHome/skills/*/SKILL.md` and `harnessHome/profiles/.generations/live/*/node_modules/*/skills/*/SKILL.md` for on-disk skills; disk names missing from the registry are returned as `drift.onDiskOnly`, registry entries whose locator path does not exist as `drift.brokenLocator`. `collectPlugins(harnessHome)` reads `desired.json`, lists `.generations/live/*` (id, version from id split on `+`), and parses `profiles/web/cordis.patch.yml` insert rows (`id`, `name`). `collectMcpServers(harnessHome)` parses the same patch with `yaml`, keeps rows where `name === '@deepseek-ai/dsh-mcp-client'`, returns `{ serverName, transport, command, args, env }` plus `source: 'profile-patch'`; any parse failure returns `[]` (never throws).

**API reserved:** `searchKnowledge`-style queries are NOT collected here — memory content comes from Task 5 adapters.

**Where next connects:** `lib/snapshot.js` (Task 8) consumes all three; `mcp-rows` also feeds Task 5's kb-mcp command resolution.

**Interfaces:**
- Consumes: `ctx.skills.list`, filesystem under `<harnessHome>` (default `~/Library/Application Support/dsh-desktop/harness`, env override `DSH_DESKTOP_HOME`), `yaml`.
- Produces:
  - `collectSkills(ctx, opts) → { entries: SkillEntry[], drift: { onDiskOnly: string[], brokenLocator: string[] }, scannedAt: string }`
  - `collectPlugins(harnessHome) → { desired: string[], generations: { id, name, version }[], patchRows: { id, name }[] }`
  - `collectMcpServers(harnessHome) → McpServerRow[]`
  - `resolveHarnessHome(env) → string`

- [ ] **Step 1: Write the failing tests** — `tests/collectors.test.mjs` with a fake `ctx = { skills: { list: async () => [fakeCandidates] } }` and tmp fixture dirs: (a) registry entries normalize and defaults apply when `invocation` missing; (b) a tmp `skills/ghost/SKILL.md` appears in `drift.onDiskOnly`; (c) a registry entry with a non-existent locator appears in `drift.brokenLocator`; (d) `collectPlugins` reads a fixture `desired.json` + one generation dir + patch rows; (e) `collectMcpServers` extracts the `anything-kb` row from a fixture patch YAML and returns `[]` on malformed YAML.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/collectors.test.mjs`.
- [ ] **Step 3: Implement the three collectors** — per Logic; all functions pure apart from fs reads; inject `fs` only via `node:fs`.
- [ ] **Step 4: Run to verify PASS** — same command; all five cases green.

### Task 4: Adapter registry + contracts + Null defaults

**Files:**
- Create: `lib/adapters/types.js`, `lib/adapters/registry.js`, `lib/adapters/null.js`
- Test: `tests/adapters.test.mjs`

**Functional view:** A registry object that holds named adapters behind stable contracts; every later adapter (prep-memory, evolution, toolkit) plugs in here; missing adapters resolve to Null implementations so the panel never sees `undefined`.

**Logic:** `types.js` is documentation-as-types: JSDoc typedefs `ReadAdapter`, `WriteAdapter`, `ToolkitAdapter` plus factory-signature constants (`PREP_MEMORY_READ`, `EVOLUTION_MEMORY`, `AGENT_TOOLKIT` slot ids). `registry.js`: `createRegistry()` returns `{ register(adapter), get(id), all(), health() }`; `get('prep-memory-read')` auto-returns the Null implementation when nothing registered; `health()` maps each slot id to `{ ok, id, kind, label }` where Null slots report `ok: false, reason: 'not-connected'`. `null.js`: `createNullPrepMemoryRead()`, `createNullEvolutionMemory()`, `createNullToolkit()` with the exact method surface of the real adapters (returning empty/reason payloads).

**API reserved:** real adapter bodies (Tasks 5–7).

**Where next connects:** `index.js` (Task 8 wiring) builds the registry and passes adapters into `buildSnapshot`.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createRegistry() → { register, get, all, health }` (ids: `'prep-memory-read' | 'evolution-memory' | 'agent-toolkit'`)
  - Null adapters whose methods resolve to `{ ok: false, reason: 'not-connected' }` / `[]` without throwing.

- [ ] **Step 1: Write the failing tests** — register nothing: `get('prep-memory-read').health().ok === false` and every Null method returns the degraded payload without throwing; register a stub: `get` returns the stub; `health()` lists all three slots.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/adapters.test.mjs`.
- [ ] **Step 3: Implement registry + null adapters** per Logic.
- [ ] **Step 4: Run to verify PASS**.

### Task 5: 前置准备记忆复用库读取接口（PrepMemoryRead）

**Files:**
- Create: `lib/adapters/prep-memory.js`, `lib/adapters/stdio-jsonrpc.js`
- Test: `tests/prep-memory.test.mjs`

**Functional view:** With AnyThingKB's `kb-mcp` present, the host can list knowledge bases, read per-base stats, and run keyword/hybrid searches — surfaced in the Memory tab. Without it, the same panel shows "未接入".

**Logic:** `stdio-jsonrpc.js`: `createStdioJsonRpc({ command, args, env, timeoutMs = 5000 }) → { request(method, params), close() }` — spawns the binary, speaks newline-delimited JSON-RPC 2.0 (initialize → notifications/initialized → request), increments ids, rejects on timeout or process exit, queues requests until initialize completes. `prep-memory.js`: `createStdioMcpPrepMemoryRead({ command, args, env })` wraps the MCP tools `list_knowledge_bases`, `kb_stats`, `search_knowledge`, `search_deep` into `{ listKnowledgeBases(), kbStats(base), searchKnowledge({ base, query, topK }), searchDeep({ base, query }) }`, each mapping MCP content arrays to plain JSON; `createHttpPrepMemoryRead({ endpoint })` reserved placeholder returning `{ ok:false, reason:'not-configured' }` (future agent toolkits / remote shared library). A shared `toResult` wrapper converts any thrown transport error into `{ ok: false, reason }`.

**API reserved:** HTTP transport body (remote agent-toolkit era).

**Where next connects:** Task 8 resolver picks StdioMcp when the `anything-kb` row exists and the binary is executable, else Null; the Memory tab calls these methods.

**Interfaces:**
- Consumes: `McpServerRow` from Task 3.
- Produces: `createStdioJsonRpc(opts)`, `createStdioMcpPrepMemoryRead(opts)`, `createHttpPrepMemoryRead(opts)` — all with `describe() → { id, kind:'read', label }` and `health()`.

- [ ] **Step 1: Write the failing tests** — fake transport: inject a scriptable line-based responder (`tests/fake-mcp.mjs` echo process that answers `initialize` then `tools/call` with fixture payloads); assert (a) `listKnowledgeBases()` maps a fixture `list_knowledge_bases` result to `[{ key, name, items }]`; (b) `searchKnowledge` passes `{ base, query, top_k }` params verbatim and unwraps `content[0].text` JSON; (c) a transport timeout resolves to `{ ok:false, reason }` instead of throwing; (d) `createHttpPrepMemoryRead` reports not-configured.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/prep-memory.test.mjs`.
- [ ] **Step 3: Implement stdio-jsonrpc + prep-memory adapters** per Logic; process spawn via `node:child_process.spawn`, `stdio: ['pipe','pipe','pipe']`, kill on close.
- [ ] **Step 4: Run to verify PASS** — all four cases green; no orphaned child processes after `close()`.

### Task 6: 结束的进化记忆接口（EvolutionMemory）+ 自动触发

**Files:**
- Create: `lib/spool.js`, `lib/adapters/evolution.js`, `scripts/evolve-memory.mjs`
- Modify: `index.js` (wire session hooks + config gate)
- Test: `tests/evolution.test.mjs`

**Functional view:** Every finished session produces one evolution record: appended to a spool file and (auto, when healthy) ingested into the KB through the same stdio MCP channel as Task 5. `scripts/evolve-memory.mjs` re-ingests any un-ingested spool records (manual/backfill path). The Evolution tab shows spool stats and an "立即归档" button (POST route, Task 8).

**Logic:** `spool.js`: `appendSpoolRecord(dir, record)` appends JSONL to `<dir>/evolution-spool.jsonl` (mkdir -p), marks `record.ingested:false`; `readSpool(dir)` parses lines tolerating a trailing partial line. `evolution.js`: `createFileSpoolEvolutionMemory({ dir })` (`appendRecord`, `listRecords`, `markIngested(ids)`); `createMcpEvolutionMemory({ rpc })` maps to `auto_ingest_text` with `{ content, turn_text: 'session-end:' + sessionId, operator: 'ai:plugin:dsh-superpower-vision', source: { name, type: 'plugin', uri } }` — PENDING by contract, never APPROVED. Auto trigger in `index.js`: `ctx.on('session/event', (session, event) => { if settlement → count })`; `ctx.on('session/disposed', (session) => { if auto gate open and sessionId unseen → build record {kind:'session-end', sessionId, cwd, at, counters} → spool.append → if Mcp adapter healthy → ingest + markIngested })`. Record shape fixed: `{ kind, sessionId, cwd, at, counters: { assistantMessages, attempts }, ingested }`. Throttle: in-memory `Set` of session ids per process.

**API reserved:** richer content distillation (LLM-summarized session digest) — spool record carries counters only in 0.1.0.

**Where next connects:** Task 8 exposes POST `{ action:'evolve:ingest' }`; Task 9 Evolution tab renders stats + button; `scripts/evolve-memory.mjs` is the backfill CLI.

**Interfaces:**
- Consumes: Config `evolutionAuto` (volatile; unwrap each read), `createStdioJsonRpc` (Task 5), spool dir = `<harnessHome>/profiles/web/dsh-superpower-vision/spool`.
- Produces: `appendSpoolRecord`, `readSpool`, `createFileSpoolEvolutionMemory`, `createMcpEvolutionMemory`, `buildSessionEndRecord({ sessionId, cwd, counters })`, `createEvolutionHook({ config, spool, mcp }) → { onSessionEvent(session, event), onSessionDisposed(session), pendingCount() }`.

- [ ] **Step 1: Write the failing tests** — (a) spool append+read round-trip incl. malformed trailing line tolerance; (b) `buildSessionEndRecord` shape with counters from a fake settlement event sequence; (c) evolution hook: two settlement events then dispose → exactly one spool record, `pendingCount() === 1`; second dispose with same sessionId → still one; (d) Mcp evolution: fake rpc receives `auto_ingest_text` with `turn_text` `'session-end:<id>'` and no status field; (e) gate closed (`evolutionAuto=false`) → no record.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/evolution.test.mjs`.
- [ ] **Step 3: Implement spool + adapters + hook + evolve-memory.mjs** per Logic.
- [ ] **Step 4: Run to verify PASS**; `node --check scripts/evolve-memory.mjs` clean.

### Task 7: Agent Toolkit 适配层（ToolkitAdapter）

**Files:**
- Create: `lib/adapters/toolkit.js`
- Test: `tests/toolkit.test.mjs`

**Functional view:** The Toolkit tab lists every MCP server row found in the desktop profile patch as a toolkit descriptor (id, serverName, transport, command, health), with a documented接入路径 (add a patch row + drop an adapter file) made visible in the panel.

**Logic:** `describeToolkits(rows)` maps `McpServerRow[]` → `ToolkitDescriptor[]` `{ id: serverName, serverName, transport, command, health: { ok: transport === 'stdio' && existsSync(command) } }`. `createToolkitAdapter({ rows, rpc })` exposes `tools()` (empty in 0.1.0 — enumeration of remote tools is a follow-up), `describe()`, `health()` aggregated from descriptors, and `invoke()` reserved (returns `{ ok:false, reason:'reserved' }`). Adding a future toolkit = new `McpServerRow` appears automatically + optionally a `lib/adapters/toolkit-<name>.js` file registering richer behavior into the registry.

**API reserved:** `invoke(name, args)` body; remote `tools()` enumeration.

**Where next connects:** Task 8 registry + snapshot; Task 9 Toolkit tab.

**Interfaces:**
- Consumes: `McpServerRow[]` (Task 3), optional rpc (Task 5).
- Produces: `describeToolkits(rows)`, `createToolkitAdapter({ rows, rpc })` with `{ describe(), health(), tools(), invoke }`.

- [ ] **Step 1: Write the failing tests** — fixture rows (one stdio with existing path, one stdio with missing path, one http): descriptors carry health flags; `tools()` → `[]`; `invoke()` → reserved payload; `health()` aggregates `ok` only when ≥1 healthy.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/toolkit.test.mjs`.
- [ ] **Step 3: Implement** per Logic.
- [ ] **Step 4: Run to verify PASS**.

### Task 8: Snapshot aggregation + host route wiring

**Files:**
- Create: `lib/snapshot.js`
- Modify: `index.js` (registry wiring, collectors, route, skills/change invalidation, evolution hook)
- Test: `tests/snapshot.test.mjs`

**Functional view:** `GET /dsh-superpower-vision/snapshot` returns one JSON document with five sections; `POST` with `{ action:'evolve:ingest' }` triggers manual evolution ingest; cache invalidates on `skills/change`.

**Logic:** `buildSnapshot({ skills, plugins, toolkits, prepMemory, evolution })` → `{ generatedAt, counts: { skills, plugins, toolkits, kbPending }, skills: { entries, drift }, plugins: { desired, generations, patchRows }, memory: { bases, statsWanted: true }, evolution: { spool: { pending, total }, auto }, toolkits }` — memory `bases` filled by calling `prepMemory.listKnowledgeBases()`; a thrown/degraded call keeps `bases: []` plus `memory.reason`. Route in `index.js`: `ctx.inject(['webServer'], host => host.effect(() => host.webServer.register({ kind:'exact', path:'/dsh-superpower-vision/snapshot', handler }, 'dsh-superpower-vision: snapshot')))` — GET serves cached-or-rebuilt snapshot (TTL from `snapshotTtlMs`, unwrap per read); POST parses JSON body, only `action:'evolve:ingest'` accepted → runs the evolution hook's manual path → `sendJson(response, 200, { ok, ingested })`; other methods → 405 with allow header; errors → 500 JSON. Helpers `sendJson`/`readJson` mirror dsh-function-preview. `ctx.on('skills/change', () => { cache = null })`.

**API reserved:** per-base deep search endpoint (Memory tab search box calls adapter directly via a follow-up route/POST action).

**Where next connects:** Task 9 client consumes the exact snapshot shape.

**Interfaces:**
- Consumes: Tasks 3–7 outputs; `Config.evolutionAuto`, `Config.kbServer`, `Config.snapshotTtlMs`.
- Produces: `buildSnapshot(input) → Snapshot` (exact section keys above), `createSnapshotRoute({ getSnapshot, onEvolveIngest }) → { kind:'exact', path:'/dsh-superpower-vision/snapshot', handler }`.

- [ ] **Step 1: Write the failing tests** — (a) `buildSnapshot` with Null prep-memory → `memory.bases: []` and no throw; (b) with stub prep-memory returning two bases → counts and bases populated; (c) route handler unit test via fake req/res: GET → 200 JSON with `skills` key; POST `evolve:ingest` → invokes `onEvolveIngest` and returns `{ok:true}`; PUT → 405 `allow: GET, POST`; malformed JSON POST → 500 not crash.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/snapshot.test.mjs`.
- [ ] **Step 3: Implement `lib/snapshot.js` and wire `index.js`** per Logic (registry built in `apply`; evolution hook created with resolved spool dir + Mcp adapter when kb row healthy).
- [ ] **Step 4: Run to verify PASS**; `node --check index.js` clean.

### Task 9: Client — five tabs + summary card + overlay

**Files:**
- Modify: `lib/client.js` (replace placeholder), `locale/zh.json`, `locale/en.json`
- Test: `tests/client.test.mjs` (pure helpers only)

**Functional view:** Settings → 「超能力全景」 shows five tabs (技能库 / 插件注册表 / 记忆复用库 / 进化记忆 / Agent Toolkit) fed by the snapshot route; the plugin-manager card shows the five-number summary; a `shell.overlay` quick-peek overlay shows the same summary line + refresh button. All copy localized zh/en, all styling via DSH alias tokens, all failures degrade to readable states.

**Logic:** `fetchSnapshot()` = `fetch('/dsh-superpower-vision/snapshot', { cache:'no-store', credentials:'same-origin' })` then JSON (null on failure); polling with 5s interval + manual refresh; tab state via `React.useState`. Tabs render from snapshot sections: SkillCatalogTab (table: name/source/rank/invocable badges/locator + drift section), PluginRegistryTab (desired list + generation table + patch rows), MemoryTab (bases list with counts, search box calling `POST { action:'memory:search', base, query }` — reserved action id, degrades to "接口预留" badge in 0.1.0), EvolutionTab (spool counts, auto flag, 「立即归档」 button → POST `evolve:ingest`), ToolkitTab (descriptor cards +接入说明 text). SummaryCard (plugins.item) = five counts with degraded dots. PeekOverlay (shell.overlay) = same counts + refresh. Registration follows verbatim the dsh-api-pool / dsh-function-preview patterns (see spec Constraints): settings.section NOT whileServed; plugins.item inside `ctx.configForms.whileServed([NS], ...)`; overlay plain inject. No early return when `configForms.get` unavailable — cards render degraded states. `inject: ['slots','locale','configForms']`.

**API reserved:** `POST { action:'memory:search' }` — reserved action id; Task 8 handler returns 501-style `{ ok:false, reason:'reserved' }` until wired.

**Where next connects:** consumes Task 8 snapshot shape exactly; nothing after it except verification.

**Interfaces:**
- Consumes: `Snapshot` (Task 8), `props.t`, primitives from `@deepseek-ai/dsh-client-ui-primitives` (Button/Switch/Input/Tag as available).
- Produces: exports `apply`, `inject`; locale key set extended (both files same keys).

- [ ] **Step 1: Write the failing tests** — pure helpers extracted from the client file: `formatCounts(snapshot)`, `skillsShown(entries, keyword)`, `degradedText(section)` — assert shapes incl. null-snapshot degradation and zh/en key parity for the locale JSON files.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/client.test.mjs`.
- [ ] **Step 3: Implement the client factory** per Logic; extract the pure helpers into `lib/client-helpers.js` (CJS-compatible `module.exports`) so tests import them without a DOM.
- [ ] **Step 4: Run to verify PASS**; `node --check lib/client.js` clean.

### Task 10: Verify script + full install & rollback rehearsal

**Files:**
- Create: `scripts/verify.mjs`
- Create: `README.md`, `README.en.md`
- Modify: `versions.md` (mark 0.1.0 built)

**Functional view:** `node scripts/verify.mjs` runs every static assertion (manifest, patch row, locale parity, test suite, generation state) and prints a PASS/FAIL table; README documents install/verify/rollback for the operator; the live browser walkthrough is an explicit manual checklist.

**Logic:** verify.mjs: (1) run `node --test tests/` and parse TAP-ish output for failures; (2) manifest + patch + locale assertions (reuse Task 1 test logic — import the test file); (3) desired/generation assertions via the installer registry modules (`readDesired`, `listGenerations`): `desired.json` contains a `dsh-superpower-vision+<pkg.version>+*` id and its generation dir exists; (4) live checks skipped by default, `--live` prints the checklist (restart reminder, settings nav expectation, `/plugins/??dsh-superpower-vision/client.js` expectation, real-browser console-error standard). Exit non-zero on any static failure.

**API reserved:** none.

**Where next connects:** the operator's install loop: bump version → `node scripts/install-local.mjs` → restart DSH Desktop → `node scripts/verify.mjs` → browser walkthrough → (if needed) `node scripts/uninstall-local.mjs`.

**Interfaces:**
- Consumes: everything above.
- Produces: `scripts/verify.mjs` (exit code contract), README pair.

- [ ] **Step 1: Write verify.mjs** — checks per Logic; run it once against the tree (no generation installed yet) → static checks PASS, generation check reports "not installed" (warning, not failure).
- [ ] **Step 2: Run the full suite** — `node --test tests/` → all green; `node scripts/verify.mjs` → table printed, exit 0 for static layer.
- [ ] **Step 3: Live rehearsal (manual checklist, operator executes)** — `node scripts/install-local.mjs`; restart DSH Desktop; browser: settings nav 「超能力全景」 present; five tabs render real data; plugins.item card shows counts; overlay opens; zero console errors; then `node scripts/uninstall-local.mjs` + restart → nav/card/overlay gone.
- [ ] **Step 4: Record evidence in `log/`** — install generation id, verification output, browser findings; update `versions.md`.
