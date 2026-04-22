# Claude-Mem Mind Maps

Mermaid `mindmap` diagrams. GitHub, VS Code's Markdown preview, and most Markdown viewers render these natively. For standalone rendering, paste into [mermaid.live](https://mermaid.live).

---

## 1. Global Architecture

```mermaid
mindmap
  root((claude-mem))
    Host Environments
      Claude Code
      Cursor
      Windsurf
      Gemini CLI
      OpenCode
      Codex CLI
      OpenClaw gateway
    Runtime
      Plugin layer
        plugin/.claude-plugin/plugin.json
        plugin/hooks/hooks.json
        plugin/modes/
        plugin/ui/viewer.html
      Bootstrap
        bun-runner.js Node
        smart-install.js Bun+uv
      Worker
        Bun runtime
        Express 37777
        SSE stream
    Storage
      SQLite
        observations
        sessions
        summaries
        prompts
        timeline
      Chroma
        vector embeddings
        semantic search
    Intelligence
      Claude SDK Agent
      Gemini Agent
      OpenRouter Agent
      tree-sitter AST
    User-Facing
      React Viewer
      MCP Server stdio
      npx CLI
      Skills
      Statusline
```

---

## 2. Source Tree (`src/`)

```mermaid
mindmap
  root((src/))
    cli/
      hook-command.ts
      stdin-reader.ts
      handlers/ 8 events
      adapters/ platform
    hooks/
      hook-response.ts
    services/
      worker-service.ts slim orchestrator
      worker-spawner.ts lightweight
      Context.ts facade
      context/
        ContextBuilder
        ObservationCompiler
        TokenCalculator
        sections/
      server/
        Server.ts Express
        Middleware.ts
        ErrorHandler.ts
      worker/
        DatabaseManager
        SessionManager
        SearchManager 78KB
        SDKAgent
        GeminiAgent
        OpenRouterAgent
        BranchManager
        SSEBroadcaster
        http/routes/ 8 modules
      sqlite/
        Database.ts
        migrations/
        Observations
        Sessions
        Summaries
      sync/
        ChromaSync
        ChromaMcpManager
      infrastructure/
        ProcessManager
        HealthMonitor
        GracefulShutdown
        WorktreeAdoption
      integrations/
        Cursor
        Windsurf
        Gemini
        OpenCode
        OpenClaw
        Codex
        McpIntegrations
      domain/
        ModeManager
      queue/
        SessionQueueProcessor
      smart-file-read/
        tree-sitter
      transcripts/
        watcher
    servers/
      mcp-server.ts Node
    sdk/
      parser.ts
      prompts.ts
    supervisor/
      process-registry
      health-checker
      shutdown
      env-sanitizer
    npx-cli/
      commands/install.ts
      commands/uninstall.ts
      commands/runtime.ts
      ide-detection.ts
    ui/viewer/
      components/
      hooks/
      utils/
    utils/
      tag-stripping.ts privacy
      logger.ts
      claude-md-utils
      transcript-parser
      worktree
    shared/
      paths.ts
      hook-constants.ts
      plugin-state.ts
      worker-utils.ts port calc
      EnvManager
      SettingsDefaultsManager
    bin/
      import-xml-observations
      cleanup-duplicates
    types/
      database
      transcript
```

---

## 3. Plugin Runtime (`plugin/`)

```mermaid
mindmap
  root((plugin/))
    Manifests
      .claude-plugin/plugin.json
      hooks/hooks.json 7 events
      .mcp.json stdio server
      package.json tree-sitter grammars
    scripts/
      bun-runner.js
        Node bootstrap
        finds Bun
        buffers stdin libuv fix
      worker-service.cjs
        CJS loader
        imports worker-service.ts
      worker-wrapper.cjs
        daemon manager
        SIGTERM SIGINT
      worker-cli.js
        start stop restart status
      mcp-server.cjs
        stdio MCP protocol
      context-generator.cjs
        SessionStart hook
      statusline-counts.js
        ~10ms SQLite read
      smart-install.js
        Bun uv auto-install
    modes/ 39 JSON files
      code.json
      code--chill.json
      code--ja.json localized
      law-study variants
      meme-tokens custom
    ui/
      viewer.html
      viewer-bundle.js
      assets fonts icons
    skills/
      mem-search
      make-plan
      do
      knowledge-agent
      smart-explore
      timeline-report
      version-bump
```

---

## 4. Lifecycle Hooks

```mermaid
mindmap
  root((7 Hooks))
    Setup
      smart-install.js
      install Bun
      install uv
    SessionStart
      context hook
      ContextBuilder
      inject prompt
    UserPromptSubmit
      session-init hook
      record prompt
      tag stripping
    PreToolUse Read
      file-context hook
      smart-file-read
      AST summary
    PostToolUse
      observation hook
      queue async
      AI compress
      SQLite + Chroma
    Stop
      summarize hook
      SDKAgent
      session summary
    SessionEnd
      session-complete hook
      flush queues
      cleanup
```

---

## 5. Skills

```mermaid
mindmap
  root((Skills))
    mem-search
      search index IDs
      timeline window
      fetch full
      HTTP backed 37777
    make-plan
      Phase 0 docs discovery
      subagents for facts
      verification checklists
      copy from docs pattern
    do
      execute phase
      verify
      anti-pattern check
      code review
      commit
      branch handoff
    knowledge-agent
      build_corpus filters
      prime_corpus load
      query_corpus chat
      persists reprime
    smart-explore
      smart_search symbols
      smart_outline skeleton
      smart_unfold source
      12+ languages
      4-8x token savings
    timeline-report
      full project history
      SQL over claude-mem.db
      10-section narrative
      3-6K words
    version-bump
      semantic versioning
      build
      git tag push
      GitHub release
      Discord notify
      changelog
```

---

## 6. Integrations & Distribution

```mermaid
mindmap
  root((Integrations))
    Claude Code native
      plugin/
      hooks.json
      .mcp.json
    Cursor
      CursorHooksInstaller
      .cursor/hooks.json
      .cursor/mcp.json
      .cursor/rules/*.mdc
      levels project user enterprise
    Windsurf
      WindsurfHooksInstaller
      ~/.windsurf/ config
    Gemini CLI
      GeminiCliHooksInstaller
      agent config JSON
    OpenCode
      OpenCodeInstaller
      .openclaw/ dir
    Codex CLI
      CodexCliInstaller
      .codex-plugin/plugin.json
    OpenClaw gateway
      openclaw/ standalone
      pre-built
      install.sh one-liner
      observation feed
      Telegram Discord Slack
    MCP
      mcp-server.cjs stdio
      McpIntegrations central
    Marketplace
      .claude-plugin/marketplace.json
      HM Consulting publisher
      sync-to-marketplace.sh
```

---

## 7. Data Flow (hook → storage → UI)

```mermaid
mindmap
  root((Data Flow))
    Input
      Hook event JSON stdin
      bun-runner spawn
      worker-service.cjs
      hook-command route
      handler
    Edge processing
      tag-stripping.ts
      privacy tags removed
      ReDoS protected
    Transport
      HTTP POST 37777
      /hook/claude-code/event
    Business logic
      SessionManager
      SearchManager hybrid
      Agents SDK Gemini OpenRouter
      BranchManager
    Storage writes
      SQLite
        observations
        sessions
        summaries
        prompts
      Chroma via MCP
        embeddings
        batched
    Output
      SSEBroadcaster
      React Viewer live
      Statusline counts
      MCP responses
      Context injection next session
```

---

## 8. Build & Release

```mermaid
mindmap
  root((Build/Release))
    Source
      src/ TypeScript
      tsconfig.json
    Build
      build-hooks.js
        esbuild TS to CJS
        worker-service
        mcp-server
        context-generator
        strip __dirname
      build-viewer.js
        esbuild React to IIFE
        copy assets fonts icons
      build-worker-binary.js
        bun compile
        dist/binaries/*.exe
    Sync
      sync-plugin-manifests.js
        align versions
      sync-marketplace.cjs
      sync-to-marketplace.sh
    Publish
      publish.js
        git status check
        prompt bump
        update manifests
        npm run build
        commit tag push
      generate-changelog.js
        incremental or full
      discord-release-notify.js
        POST webhook
    Artifacts
      plugin/ distributable
      dist/npx-cli bundled
      dist/binaries worker exe
```

---

## 9. Storage & Ports

```mermaid
mindmap
  root((Runtime State))
    ~/.claude-mem/
      claude-mem.db SQLite
      chroma/ vector DB
      cursor-projects.json
      settings.json
      .install-version marker
    Network
      HTTP 37700 + uid%100
        default 37777
      SSE /stream
      route /hook/claude-code/*
      route /api/*
      route /ui /health
    IPC
      MCP stdio Claude Code
      chroma-mcp stdio
      worker-wrapper signals
    Build outputs
      plugin/scripts/*.cjs
      plugin/ui/viewer-bundle.js
      dist/npx-cli/index.js
      dist/binaries/*.exe
```
