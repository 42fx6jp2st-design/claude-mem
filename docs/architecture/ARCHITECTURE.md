# Claude-Mem Architecture

> Module-level architecture report. For visual mind maps see [MINDMAP.md](./MINDMAP.md). For process diagrams see [processes/](./processes/). For usage see [USER_GUIDE.md](./USER_GUIDE.md).

---

## 1. What claude-mem Is

Claude-mem is a **Claude Code plugin** (also installable into Cursor, Windsurf, Gemini CLI, OpenCode, Codex, and the OpenClaw gateway) that provides **persistent memory across AI coding sessions**. It captures tool usage via lifecycle hooks, compresses observations using the Claude Agent SDK, stores them in SQLite + Chroma (vector embeddings), and injects relevant context into future sessions.

- **Language**: TypeScript (source) → ESM/CJS JavaScript (built artifact)
- **Runtimes**: Bun (worker, hooks), Node.js (MCP server, npx-cli, bun-runner bootstrap)
- **Storage**: SQLite (`~/.claude-mem/claude-mem.db`), Chroma (`~/.claude-mem/chroma/`)
- **Transport**: HTTP on `localhost:37700 + (uid % 100)` (default 37777 for uid-aligned users), plus stdio MCP
- **UI**: React SPA served by the worker, bundled via esbuild

---

## 2. Runtime Topology (high-level)

```
┌──────────────────────────────┐
│        Claude Code            │  (host IDE)
│  reads plugin manifest        │
│  fires lifecycle hooks        │
└──────────┬───────────────────┘
           │  stdin JSON per hook event
           ▼
┌──────────────────────────────┐
│  plugin/hooks/hooks.json      │  (event → script mapping)
│  plugin/scripts/bun-runner.js │  (Node bootstrap: finds Bun, buffers stdin)
└──────────┬───────────────────┘
           │  spawns
           ▼
┌──────────────────────────────┐
│  plugin/scripts/              │
│    worker-service.cjs         │  CJS loader → imports src/services/worker-service.ts
│    worker-wrapper.cjs         │  Daemon manager (SIGTERM/SIGINT, restart)
│    mcp-server.cjs             │  stdio MCP protocol for search/context
│    context-generator.cjs      │  SessionStart context injection
│    statusline-counts.js       │  Tiny SQLite read for Claude status bar
└──────────┬───────────────────┘
           │  HTTP 37777+
           ▼
┌──────────────────────────────┐
│   Worker Service (Bun)        │
│   Express routes:             │
│     /health  /stream (SSE)    │
│     /hook/claude-code/*       │
│     /api/search /api/timeline │
│     /api/observations /ui     │
└──────────┬───────────────────┘
           │
           ├─────────► SQLite (observations, sessions, summaries, prompts)
           ├─────────► Chroma (via chroma-mcp stdio) — vector embeddings
           └─────────► SSE broadcast → React Viewer (localhost:37777/ui)
```

---

## 3. Lifecycle Hooks

CLAUDE.md describes **5 canonical hooks**: `SessionStart → UserPromptSubmit → PostToolUse → Summary → SessionEnd`. The full registration in [plugin/hooks/hooks.json](../../plugin/hooks/hooks.json) fires **7 events**:

| # | Event | Matcher | Script chain | Purpose |
|---|-------|---------|--------------|---------|
| 1 | `Setup` | — | `smart-install.js` | First-run: install Bun + uv if missing |
| 2 | `SessionStart` | — | `bun-runner → worker-service.cjs hook claude-code context` | Inject past-session context into Claude prompt |
| 3 | `UserPromptSubmit` | — | `... session-init` | Track session metadata, record user prompt |
| 4 | `PreToolUse` | `Read` | `... file-context` | Attach file-edit history before reads |
| 5 | `PostToolUse` | all tools | `... observation` | Capture observation, queue for AI compression |
| 6 | `Stop` | — | `... summarize` | Generate session summary via SDK |
| 7 | `SessionEnd` | — | `... session-complete` | Final cleanup, flush queues |

Each hook receives JSON via stdin, is routed through [src/cli/hook-command.ts](../../src/cli/hook-command.ts) to the correct handler in [src/cli/handlers/](../../src/cli/handlers/), which HTTP-POSTs to the worker.

---

## 4. Source Modules (`src/`)

### 4.1 Hook pipeline
- **[src/cli/](../../src/cli/)** — Hook orchestrator. `hook-command.ts` parses stdin, routes to 8 handlers (`context`, `session-init`, `observation`, `summarize`, `session-complete`, `user-message`, `file-edit`, `file-context`), classifies errors, exits with correct code (0/1/2 per CLAUDE.md exit-code strategy).
- **[src/hooks/hook-response.ts](../../src/hooks/hook-response.ts)** — Shared response contract (continue, suppressOutput, exitCode).

### 4.2 Worker core (`src/services/`)
- **`worker-service.ts`** — ~300-line slim orchestrator (refactored from 2000-line monolith). Boots HTTP server, delegates to infrastructure + worker modules.
- **`worker-spawner.ts`** — Lightweight "ensure daemon running" helper. Used by MCP server which runs under Node and cannot pull Bun-specific deps.
- **`server/`** — Express app setup, middleware (CORS, compression), error handler.
- **`worker/`** — Business logic: `DatabaseManager`, `SessionManager`, `SearchManager` (~78KB, hybrid SQL+vector), `SDKAgent` / `GeminiAgent` / `OpenRouterAgent`, `BranchManager`, `SSEBroadcaster`, `RestartGuard`, `ProcessRegistry`.
- **`worker/http/routes/`** — 8 route modules: `ViewerRoutes`, `SessionRoutes`, `SearchRoutes`, `DataRoutes`, `SettingsRoutes`, `MemoryRoutes`, `CorpusRoutes`, `LogsRoutes`.
- **`infrastructure/`** — `ProcessManager` (PID files, Windows cooldown), `HealthMonitor` (polls `/health`), `GracefulShutdown`, `WorktreeAdoption` (adopts merged git worktrees).
- **`queue/SessionQueueProcessor.ts`** — Async queue drain for session events.

### 4.3 Context & storage
- **`context/`** — `ContextBuilder` (assembles context from observations/summaries), `ObservationCompiler`, `TokenCalculator`, section formatters (timeline, facts, concepts, narrative, files).
- **`sqlite/`** — Database abstraction. `Database.ts` handles connection, schema repair, migration running. Domain classes: `Observations`, `Sessions`, `Summaries`, `Prompts`, `Timeline`. Migrations in `migrations/runner.ts`.
- **`sync/ChromaSync.ts`** — Batched sync of observations/summaries to Chroma via `ChromaMcpManager` (MCP stdio client).
- **`smart-file-read/`** — Tree-sitter–based structural file analysis for `PreToolUse(Read)` hook.
- **`domain/ModeManager.ts`** — Loads user-defined context modes from config.
- **`transcripts/`** — Optional file-system watcher for manual observation capture.

### 4.4 Editor integrations (`src/services/integrations/`)
| Installer | Target | Writes to |
|-----------|--------|-----------|
| `CursorHooksInstaller.ts` | Cursor | `~/.cursor/hooks.json`, `~/.cursor/mcp.json`, `.cursor/rules/claude-mem-context.mdc` |
| `WindsurfHooksInstaller.ts` | Windsurf | `~/.windsurf/` equivalents |
| `GeminiCliHooksInstaller.ts` | Gemini CLI | Agent config JSON |
| `OpenCodeInstaller.ts` | OpenCode | `.openclaw/` dir |
| `OpenClawInstaller.ts` | OpenClaw gateway | `~/.openclaw/extensions/claude-mem/` + registration in `openclaw.json` |
| `CodexCliInstaller.ts` | Codex CLI | Codex config |
| `McpIntegrations.ts` | all | Central MCP server registration |

### 4.5 Servers
- **[src/servers/mcp-server.ts](../../src/servers/mcp-server.ts)** — Thin MCP wrapper around the worker HTTP API. Runs under Node (deliberately, so it doesn't require Bun). Built to `plugin/scripts/mcp-server.cjs`.

### 4.6 Utilities & shared
- **`src/utils/tag-stripping.ts`** — Strips `<private>`, `<system-instruction>`, `<system-reminder>`, `<claude-mem-context>` at the hook edge, ReDoS-protected. Critical privacy boundary per CLAUDE.md.
- **`src/utils/`** — Logger, error messages, CLAUDE.md parsing, transcript parsing, project filtering, JSON utils, Bun path detection, worktree helpers.
- **`src/shared/`** — Cross-boundary constants & utilities: `paths.ts`, `hook-constants.ts`, `plugin-state.ts`, `worker-utils.ts` (port calc: `37700 + uid%100`), `EnvManager`, `SettingsDefaultsManager`.
- **`src/supervisor/`** — Daemon supervision: `process-registry`, `health-checker`, `shutdown`, `env-sanitizer`.

### 4.7 CLI & UI
- **`src/npx-cli/`** — User-facing `npx claude-mem <cmd>` entry. Commands: `install.ts` (19KB, IDE detection + marketplace install), `uninstall.ts`, `runtime.ts` (worker start/stop/status/logs), `ide-detection.ts`. Bundled to `dist/npx-cli/index.js`.
- **`src/sdk/parser.ts`** — Parses observations/summaries from SDK format; consumed by ChromaSync & context builders.
- **`src/ui/viewer/`** — React SPA. Components: `Header`, `Feed`, `ObservationCard`, `PromptCard`, `SummaryCard`, `ContextSettingsModal`, `LogsModal`, `ThemeToggle`, `TerminalPreview`, `ErrorBoundary`. Built via `scripts/build-viewer.js` → `plugin/ui/viewer-bundle.js`.

### 4.8 Bin & types
- **`src/bin/`** — Standalone maintenance CLIs (`import-xml-observations.ts`, `cleanup-duplicates.ts`).
- **`src/types/`** — Shared TypeScript types (database, transcript, tree-kill stubs).

---

## 5. Plugin Runtime (`plugin/`)

| File | Purpose |
|------|---------|
| `plugin/.claude-plugin/plugin.json` | Runtime manifest Claude Code actually reads |
| `plugin/hooks/hooks.json` | Event → script mapping (the 7 hooks) |
| `plugin/scripts/bun-runner.js` | Finds Bun, buffers stdin (libuv pipe fix), spawns worker |
| `plugin/scripts/worker-service.cjs` | CJS loader for `src/services/worker-service.ts` |
| `plugin/scripts/worker-wrapper.cjs` | Daemon lifecycle manager |
| `plugin/scripts/worker-cli.js` | User CLI: `start\|stop\|restart\|status` |
| `plugin/scripts/mcp-server.cjs` | MCP stdio entry (built from `src/servers/mcp-server.ts`) |
| `plugin/scripts/context-generator.cjs` | Standalone context injection hook |
| `plugin/scripts/statusline-counts.js` | ~10ms SQLite read for Claude status bar |
| `plugin/scripts/smart-install.js` | Bun + uv auto-install on first run |
| `plugin/modes/` | 39 conversation modes (`code.json`, `code--chill.json`, i18n variants, domain modes) |
| `plugin/ui/viewer.html` + `viewer-bundle.js` | Served React viewer |
| `plugin/.mcp.json` | Registers `mcp-search` stdio server with Claude Code |
| `plugin/package.json` | Tree-sitter grammars for 23 languages |

**Why two `.claude-plugin/plugin.json` files?** The root-level one registers with the marketplace; the `plugin/`-level one is what Claude Code extracts and executes at runtime.

---

## 6. Skills (`plugin/skills/`)

Skills are SKILL.md-based prompt packages auto-invoked by Claude when their `description` matches the user's request.

| Skill | Purpose | Mechanism |
|-------|---------|-----------|
| `mem-search` | Recall past work across sessions | 3-layer: search (IDs) → timeline (context window) → fetch (full details). HTTP-backed. |
| `make-plan` | Phased implementation planning | Deploys subagents for docs discovery; Phase 0 = documentation. |
| `do` | Execute a plan | Spawns fresh subagent per phase; verification → anti-pattern → review → commit. |
| `knowledge-agent` | Custom "brains" from observation history | Build/prime/query a corpus filtered by project/concept/date. |
| `smart-explore` | AST-based code search | tree-sitter over 12+ languages; 4–8× token savings vs `Read`. |
| `timeline-report` | Project history narrative | SQL over `claude-mem.db` → 3–6K word "Journey Into X" report. |
| `version-bump` | Release automation | Bumps versions, builds, tags, pushes, GitHub releases, changelog. |

`make-plan → do` handoff: plan carries phases + doc refs + verification checklists; `do` reads the plan and deploys execution subagents per phase with full context.

---

## 7. Build & Publish (`scripts/`)

**Build**
- `build-hooks.js` — esbuild TS → CJS for `worker-service`, `mcp-server`, `context-generator`. Strips hardcoded `__dirname/__filename` (Issue #1410). Generates `plugin/package.json` with tree-sitter grammars.
- `build-viewer.js` — esbuild React → `plugin/ui/viewer-bundle.js` (IIFE). Copies `viewer-template.html`, SVG icons, fonts.
- `build-worker-binary.js` — `bun compile` → `dist/binaries/worker-service-v{VERSION}-win-x64.exe`.

**Install & distribution**
- `scripts/smart-install.js` + `plugin/scripts/smart-install.js` — Path resolution (CLAUDE_PLUGIN_ROOT → script location → XDG → legacy), Bun/uv auto-install, `.install-version` marker for incremental deps.
- `sync-marketplace.cjs` + `sync-to-marketplace.sh` — Sync artifact to marketplace distribution.
- `sync-plugin-manifests.js` — Keep the three manifests version-aligned.

**Publish**
- `publish.js` — Interactive: git status → version prompt → bump → build → commit → tag → push → report URL.
- `generate-changelog.js` — Incremental CHANGELOG.md from GitHub releases (or `--full`).
- `discord-release-notify.js` — POSTs to Discord webhook (`DISCORD_UPDATES_WEBHOOK`).

**Data ops / maintenance**
- `check-pending-queue.ts`, `clear-failed-queue.ts` — inspect/clear AI-processing queue
- `export-memories.ts`, `import-memories.ts` — portable memory transfer
- `regenerate-claude-md.ts` — rebuild CLAUDE.md from timeline
- `wipe-chroma.cjs` — reset vector DB
- `transcript-to-markdown.ts` — parse transcripts

**Bug reporting** — `scripts/bug-report/` is a CLI that collects diagnostics (`cli.ts`, `collector.ts`, `index.ts`). Run via `npm run bug-report`.

---

## 8. Marketplace & Variants

Three plugin manifests exist at repo root:
- `.claude-plugin/plugin.json` — Claude Code marketplace registration (HM Consulting publisher)
- `.claude-plugin/marketplace.json` — Marketplace metadata
- `.codex-plugin/plugin.json` — Codex CLI variant (category: Productivity)

The standalone **`openclaw/`** directory is a **separate plugin** targeting the OpenClaw gateway — not compiled from src, shipped pre-built. It uses claude-mem's worker as a backend but runs on a different agent-orchestration host.

---

## 9. Privacy Boundary

`<private>content</private>` tags are stripped **at the hook layer** (`src/utils/tag-stripping.ts`) before data reaches the worker, database, or Chroma. This is edge processing — by the time the worker sees the payload, private content is already gone. The implementation is ReDoS-protected and covers: `<private>`, `<system-instruction>`, `<system-reminder>`, `<claude-mem-context>`.

---

## 10. Exit-Code Strategy (from CLAUDE.md)

| Exit | Meaning | Rationale |
|------|---------|-----------|
| `0`  | Success *or* graceful error | Prevents Windows Terminal tab accumulation on worker failure |
| `1`  | Non-blocking error | Stderr shown to user; Claude continues |
| `2`  | Blocking error | Stderr fed to Claude for processing |

The wrapper/plugin layer handles restart logic; worker errors log at ERROR level but exit 0.

---

## 11. Data Flow Summary

```
User action in Claude Code
  ↓  (hook fires with stdin JSON)
bun-runner.js  (Node bootstrap, finds Bun)
  ↓  spawn
worker-service.cjs  →  src/services/worker-service.ts  (Bun)
  ↓  HTTP POST 127.0.0.1:37777/hook/claude-code/{event}
Worker route handler
  ↓  business logic (SessionManager / SearchManager / Agent)
  ├─►  SQLite  (observations, sessions, summaries, prompts)
  ├─►  ChromaSync  →  chroma-mcp (stdio)  →  Chroma  (vectors)
  └─►  SSEBroadcaster  →  React Viewer  (UI auto-updates)

For SessionStart (reverse direction):
Worker → SQLite/Chroma → ContextBuilder → formatted context string
  → stdout JSON → Claude prompt injection
```

---

## 12. Where to Go Next

- **Visual architecture**: [MINDMAP.md](./MINDMAP.md)
- **Detailed process flows**: [processes/](./processes/) — 6 BPMN files
- **How to use each feature**: [USER_GUIDE.md](./USER_GUIDE.md)
