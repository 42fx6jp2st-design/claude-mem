# Claude-Mem User Guide

> How to use each feature of claude-mem, from global (installation) down to executable (specific commands and skills). Written in plain language; each section says **what it is**, **when to use it**, and **how to invoke it**.

---

## Table of contents

1. [Global: Install & uninstall](#1-global-install--uninstall)
2. [Worker service: the always-on brain](#2-worker-service-the-always-on-brain)
3. [Viewer UI: the memory browser](#3-viewer-ui-the-memory-browser)
4. [The 7 lifecycle hooks (what fires when)](#4-the-7-lifecycle-hooks-what-fires-when)
5. [Skills: things you ask Claude to do](#5-skills-things-you-ask-claude-to-do)
6. [Editor integrations (non–Claude Code)](#6-editor-integrations-noncluaude-code)
7. [MCP server (for external tools)](#7-mcp-server-for-external-tools)
8. [Data ops: export, import, cleanup](#8-data-ops-export-import-cleanup)
9. [Privacy: `<private>` tags](#9-privacy-private-tags)
10. [Build & release (for contributors)](#10-build--release-for-contributors)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Global: Install & uninstall

### What it is
A Claude Code plugin that adds persistent memory to your AI coding sessions. Also installs cleanly into Cursor, Windsurf, Gemini CLI, OpenCode, and Codex.

### When to use
Any time you want Claude (or another supported AI coding assistant) to remember what you did in past sessions — without manually pasting summaries.

### How to install

**In Claude Code (recommended)** — install via the marketplace:
```bash
claude --add-dir ~/.claude/plugins/marketplaces
# Then in Claude: /plugin install claude-mem
```

**Standalone via npx**:
```bash
npx claude-mem install
```
This runs [src/npx-cli/commands/install.ts](../../src/npx-cli/commands/install.ts), which detects your IDE, copies plugin files to the right marketplace location, installs Bun + uv if missing (via [scripts/smart-install.js](../../scripts/smart-install.js)), and registers hooks.

### How to uninstall
```bash
npx claude-mem uninstall
```
Stops the worker, removes the plugin directory, and unregisters hooks. Your memory database at `~/.claude-mem/claude-mem.db` is **preserved** — delete it manually if desired.

---

## 2. Worker service: the always-on brain

### What it is
A background HTTP service (Express, running on Bun) that stores observations, runs semantic search, serves the viewer UI, and broadcasts real-time updates. Listens on `127.0.0.1:37700 + (uid % 100)` (default `37777`).

### When to use
You never invoke it directly — it starts automatically when the first hook fires. But you can control it manually for debugging.

### How to invoke
From inside the plugin:
```bash
# Manual start/stop/status via the worker CLI
node plugin/scripts/worker-cli.js start
node plugin/scripts/worker-cli.js stop
node plugin/scripts/worker-cli.js restart
node plugin/scripts/worker-cli.js status
```

**Check it's running**:
```bash
curl http://localhost:37777/health
```

**Key endpoints** (consumed by the viewer + skills):
- `GET /health` — readiness
- `GET /ui` — React viewer
- `GET /stream` — Server-Sent Events live updates
- `POST /hook/claude-code/{event}` — hooks submit observations here
- `GET /api/search?query=X&limit=N` — search
- `GET /api/timeline?anchor=ID` — context window
- `GET /api/observations/:id` — full observation

### Startup chain (for debugging)
Hook → `bun-runner.js` (Node, finds Bun) → `worker-service.cjs` (CJS loader) → `src/services/worker-service.ts` (Bun) → `worker-wrapper.cjs` (daemon manager).

---

## 3. Viewer UI: the memory browser

### What it is
A React single-page app served by the worker. Shows a timeline of observations, prompts, and summaries for every project, with search and filter.

### When to use
- You want to see what claude-mem captured from a session
- You want to search memories by text
- You're debugging what got stored (or not)

### How to invoke
Open in a browser:
```
http://localhost:37777/ui
```
Or (equivalently) `http://localhost:37777/`.

### Features inside the viewer
- **Header project selector** — switch between projects
- **Feed** — timeline of observations / prompts / summaries
- **Search** — calls `/api/search`
- **Context Settings modal** — customize what gets injected into future sessions
- **Logs modal** — inspect worker logs
- **Theme toggle** — dark/light

---

## 4. The 7 lifecycle hooks (what fires when)

You don't invoke these — Claude Code fires them. Knowing what each does helps interpret what's in your database.

| # | Hook | When it fires | What it does |
|---|------|--------------|--------------|
| 1 | **Setup** | first run after install | Installs Bun + uv if missing |
| 2 | **SessionStart** | session begins | Fetches relevant past observations, builds context, injects into Claude prompt |
| 3 | **UserPromptSubmit** | right before your prompt is sent | Records prompt metadata, strips `<private>` tags |
| 4 | **PreToolUse** (matcher: `Read`) | before a file is read | Attaches recent file-edit history for that file |
| 5 | **PostToolUse** | after *every* tool call | Queues observation for async AI compression and storage |
| 6 | **Stop** | session stops | Generates a session summary via the Claude SDK |
| 7 | **SessionEnd** | session ends | Flushes queues, final cleanup |

Registered in [plugin/hooks/hooks.json](../../plugin/hooks/hooks.json). Handlers live in [src/cli/handlers/](../../src/cli/handlers/).

---

## 5. Skills: things you ask Claude to do

Skills are prompt packages Claude auto-invokes when your request matches their description. You don't type skill names — just describe what you want.

### 5.1 `mem-search` — recall past work
**When**: you ask things like *"how did we solve the auth bug last week?"*, *"what did we decide about rate limiting?"*
**What it does**: 3-layer search — (1) index IDs, (2) timeline window around a result, (3) full observation fetch. All calls hit the worker HTTP API.
**You invoke it**: just ask a recall-shaped question. Claude will decide.

### 5.2 `make-plan` — build a phased implementation plan
**When**: before a non-trivial feature or refactor. *"Help me plan the migration from X to Y"*.
**What it does**: Phase 0 is always documentation discovery (subagents fetch docs, examples, signatures). Then it lays out phases where each task is framed as "copy from docs" rather than "transform existing code." Every phase has a verification checklist.
**You invoke it**: ask for a plan — *"plan X for me"* or invoke `/make-plan` if available.

### 5.3 `do` — execute a plan
**When**: you have a plan from `make-plan` and want it built.
**What it does**: spawns a fresh subagent per phase — implementation → verification → anti-pattern check → code review → commit. Passes the full plan + phase handoff context between subagents.
**You invoke it**: *"do the plan"* or reference the plan document.

### 5.4 `knowledge-agent` — build a focused "brain"
**When**: you want a conversational AI scoped to a subset of memory — e.g., "everything about our auth system."
**Three steps**:
1. `build_corpus` — filter observations by project, concept, file, date
2. `prime_corpus` — load the corpus into an AI session
3. `query_corpus` — chat with it
The corpus persists; re-prime to refresh.

### 5.5 `smart-explore` — AST-based code search
**When**: you want to understand an unfamiliar codebase without reading entire files.
**Three tools**:
- `smart_search <query>` — find symbols ranked by relevance
- `smart_outline <file>` — get a structure skeleton
- `smart_unfold <symbol>` — get full source of a specific symbol
Supports 12+ languages. Uses 4–8× fewer tokens than `Read`.

### 5.6 `timeline-report` — generate project history narrative
**When**: you want a readable "Journey Into [Project]" document.
**What it does**: queries the full timeline from `~/.claude-mem/claude-mem.db`, writes a 3–6K word narrative covering genesis, architecture evolution, breakthroughs, work patterns, tech debt, debugging sagas, and token ROI.

### 5.7 `version-bump` — release a new version
**When**: you're ready to ship.
**What it does**: bumps versions in `package.json` / `marketplace.json` / `plugin.json`, runs `npm run build`, commits + tags, pushes, creates GitHub release, updates CHANGELOG.md.
**Input**: bump type (`patch` / `minor` / `major` / custom).

---

## 6. Editor integrations (non-Claude-Code)

### Cursor
```bash
claude-mem cursor install [project|user|enterprise]
```
Writes `.cursor/hooks.json`, `.cursor/mcp.json`, `.cursor/rules/claude-mem-context.mdc`. See [src/services/integrations/CursorHooksInstaller.ts](../../src/services/integrations/CursorHooksInstaller.ts).

### Windsurf
```bash
claude-mem windsurf install
```
Writes `~/.windsurf/` config. See [WindsurfHooksInstaller.ts](../../src/services/integrations/WindsurfHooksInstaller.ts).

### Gemini CLI
```bash
claude-mem gemini install
```
Injects memory context into Gemini agent config. See [GeminiCliHooksInstaller.ts](../../src/services/integrations/GeminiCliHooksInstaller.ts).

### OpenCode
```bash
claude-mem opencode install
```
See [OpenCodeInstaller.ts](../../src/services/integrations/OpenCodeInstaller.ts).

### Codex CLI
Installed via `.codex-plugin/plugin.json` manifest. See [CodexCliInstaller.ts](../../src/services/integrations/CodexCliInstaller.ts).

### OpenClaw gateway
A **separate plugin** shipped pre-built in [openclaw/](../../openclaw/). Use the one-line install from `openclaw/SKILL.md`:
```bash
bash openclaw/install.sh
```
Registers with `~/.openclaw/openclaw.json`, supports observation feed to Telegram / Discord / Slack / etc.

---

## 7. MCP server (for external tools)

### What it is
A stdio-based Model Context Protocol server ([src/servers/mcp-server.ts](../../src/servers/mcp-server.ts) → [plugin/scripts/mcp-server.cjs](../../plugin/scripts/mcp-server.cjs)) that exposes memory search/retrieval to any MCP-compatible client.

### When to use
- You have another AI tool that supports MCP and want it to read claude-mem memory
- You want to call memory from scripts without hitting HTTP directly

### How to invoke
Registered automatically via [plugin/.mcp.json](../../plugin/.mcp.json):
```json
{
  "mcpServers": {
    "mcp-search": {
      "type": "stdio",
      "command": "bun",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs"]
    }
  }
}
```
Exposes tools like `search_observations`, `retrieve_context`. Under the hood the MCP server just talks to the worker HTTP API.

---

## 8. Data ops: export, import, cleanup

Run from the repo root with `bun`/`tsx`/`ts-node`:

| Command | Purpose |
|---------|---------|
| `bun scripts/export-memories.ts <out.json>` | Export all observations to JSON |
| `bun scripts/import-memories.ts <in.json>` | Import observations from JSON |
| `bun scripts/check-pending-queue.ts` | Inspect pending AI-compression queue |
| `bun scripts/clear-failed-queue.ts [--all --force]` | Clear stuck queue entries |
| `bun scripts/regenerate-claude-md.ts [--dry-run]` | Rebuild `CLAUDE.md` from timeline |
| `bun scripts/transcript-to-markdown.ts <file>` | Convert transcripts to markdown |
| `node scripts/wipe-chroma.cjs` | Reset vector DB (SQLite is unaffected) |

**Maintenance utilities in `src/bin/`**:
- `bun src/bin/cleanup-duplicates.ts` — dedupe observations
- `bun src/bin/import-xml-observations.ts` — bulk XML import

---

## 9. Privacy: `<private>` tags

Wrap anything you don't want stored:
```
<private>
  My API keys are AKIA…
</private>
```

This is stripped **at the hook edge** by [src/utils/tag-stripping.ts](../../src/utils/tag-stripping.ts) *before* the observation reaches the worker, SQLite, or Chroma. Tag stripping also handles: `<system-instruction>`, `<system-reminder>`, `<claude-mem-context>`. The regex is ReDoS-protected.

---

## 10. Build & release (for contributors)

### Day-to-day
```bash
npm run build-and-sync
```
Runs [scripts/build-hooks.js](../../scripts/build-hooks.js) (compiles TS hooks), [build-viewer.js](../../scripts/build-viewer.js) (bundles React), syncs manifests, and restarts the worker.

### Individual build steps
```bash
node scripts/build-hooks.js           # → plugin/scripts/*.cjs
node scripts/build-viewer.js          # → plugin/ui/viewer-bundle.js
node scripts/build-worker-binary.js   # → dist/binaries/worker-service-*.exe
```

### Release
```bash
node scripts/publish.js
```
Interactive: prompts for `patch`/`minor`/`major`, updates manifests, builds, commits, tags, pushes.

Then:
```bash
node scripts/generate-changelog.js                       # incremental
node scripts/discord-release-notify.js v$NEW_VERSION     # requires DISCORD_UPDATES_WEBHOOK in .env
```

**Note from CLAUDE.md**: the changelog is auto-generated — do not edit it by hand.

### Bug reports
```bash
npm run bug-report
```
Runs [scripts/bug-report/cli.ts](../../scripts/bug-report/cli.ts) which collects diagnostics.

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Worker won't start | Bun missing from PATH | `node plugin/scripts/smart-install.js` (runs auto-install) |
| Viewer shows "connection refused" | Worker down | `node plugin/scripts/worker-cli.js start` |
| Port conflict | Another service on 37777 | Port is `37700 + uid%100`; check for leftover processes |
| `<private>` content appears in DB | Edge-layer tag-stripping bypassed | Open issue — this is a bug; data should never hit the DB |
| Windows Terminal tabs accumulate | Hook exit codes | By design, hooks exit 0 on graceful errors; check logs for root cause |
| Chroma out of sync | Vector index stale | `node scripts/wipe-chroma.cjs` then let it re-index |
| Stuck pending queue | AI provider unavailable | `bun scripts/clear-failed-queue.ts --all --force` |
| Plugin not detected | Wrong marketplace path | Verify `~/.claude/plugins/marketplaces/hm-consulting/` exists |

**Logs**: `~/.claude-mem/logs/` (worker, hook events, MCP).

**Settings**: `~/.claude-mem/settings.json` (auto-created with defaults on first run).

---

## Further reading

- [ARCHITECTURE.md](./ARCHITECTURE.md) — module-level architecture
- [MINDMAP.md](./MINDMAP.md) — visual mind maps
- [processes/](./processes/) — BPMN flow diagrams (6 core processes)
- Public docs: [https://docs.claude-mem.ai](https://docs.claude-mem.ai) (Mintlify)
- Source: [CLAUDE.md](../../CLAUDE.md) — the canonical project brief
