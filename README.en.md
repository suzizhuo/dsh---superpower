# dsh-superpower-vision

DSH (DeepSeek-Hanex) Desktop plugin: the **Superpower Vision** panel.

It visualizes four classes of live runtime state inside DSH Settings:

| Tab | Contents |
|---|---|
| Skills | Host registry skills (provider/source/rank/invocability) + on-disk skills drift |
| Plugin registry | desired.json pointers, generation dirs, profile patch rows |
| Memory library | kb-mcp (AnyThingKB) knowledge bases (4 verified on this machine) |
| Evolution | spool pending/total, auto-ingest switch, "Ingest now" button |
| Agent Toolkit | MCP server rows from the profile patch with health, onboarding notes |

Two extra entry points: a plugin-manager card (five-number summary) and a `shell.overlay` quick peek.

## Data layer: three reserved adapter interfaces

These implement the requirements "reserve a prep-memory read interface, an end-of-run
evolution-memory interface, and future agent-toolkit adaptation":

```
lib/adapters/
├── registry.js        # slot registry: prep-memory-read / evolution-memory / agent-toolkit
├── types.js           # ReadAdapter / WriteAdapter / ToolkitAdapter contracts (JSDoc)
├── null.js            # Null defaults: degrade without throwing when not connected
├── stdio-jsonrpc.js   # newline-delimited JSON-RPC 2.0 stdio client (initialize/timeout/self-destruct)
├── prep-memory.js     # memory read: StdioMcp (kb-mcp, verified live) + reserved Http slot
├── evolution.js       # evolution write: spool + Mcp (auto_ingest_text, PENDING contract) + session hook
└── toolkit.js         # Toolkit: MCP rows → descriptors; invoke/tools are reserved slots
```

**Onboarding a new toolkit**: add a `@deepseek-ai/dsh-mcp-client` row to the profile patch
(it shows up in the Toolkit tab automatically); for richer behavior, drop an adapter file into
`lib/adapters/` and register it, then reinstall.

## Install / verify / rollback

```bash
node scripts/install-local.mjs        # install via the generation channel (restart DSH Desktop to take effect)
node scripts/verify.mjs               # static verification (manifest/patch/locale/tests/generation)
node scripts/verify.mjs --live        # plus the real-browser walkthrough checklist
node scripts/evolve-memory.mjs        # evolution-memory backfill (spool → kb-mcp)
node scripts/uninstall-local.mjs      # rollback (drop from desired.json + re-project)
```

After any code change you must **bump `version` in package.json** before reinstalling
(generation ids embed a content hash; same name+version is refused unless `--force`).

## Development

```bash
node --test --test-force-exit tests/*.test.mjs   # 45 tests (incl. real kb-mcp end-to-end)
```

`--test-force-exit` is mandatory: the kb-mcp stdio child holds the test process event loop
open (the host closes it through the `ctx.effect` lifecycle; tests exit forcibly).

## Live verification status (2026-10-30)

- Generation `dsh-superpower-vision+0.1.0+5b4986a86823` installed into desktop profile `web`, pointed at by desired.json
- Dependency closure verification passed (host singletons resolve from the bundled DSH entry)
- Real kb-mcp stdio read passed (4 bases); auto_ingest landing passed
- **Pending operator action**: restart DSH Desktop → Settings nav 「超能力全景」 → walk the six tabs / card / overlay → zero console errors

## License

MIT
