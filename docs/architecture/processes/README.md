# BPMN Process Diagrams

Six core processes of claude-mem expressed as BPMN 2.0 XML. Open these in any BPMN viewer:

- **[Camunda Modeler](https://camunda.com/download/modeler/)** (desktop, free)
- **[bpmn.io](https://demo.bpmn.io)** (in-browser: File → Open → pick a `.bpmn`)
- **VS Code** with the "BPMN Editor" extension

## Files

| File | What it describes |
|------|-------------------|
| [session-lifecycle.bpmn](./session-lifecycle.bpmn) | The 7 Claude Code hooks from `Setup` through `SessionEnd` |
| [worker-processing.bpmn](./worker-processing.bpmn) | Hook JSON → bun-runner → worker → SQLite + Chroma + SSE |
| [install-uninstall.bpmn](./install-uninstall.bpmn) | `npx claude-mem install` / `uninstall` flows (two pools) |
| [search-memory.bpmn](./search-memory.bpmn) | `mem-search` skill: 3-layer search (index → timeline → fetch) |
| [planning-skill.bpmn](./planning-skill.bpmn) | `make-plan` → `do` collaboration (two pools, message flow) |
| [build-publish.bpmn](./build-publish.bpmn) | `scripts/publish.js` end-to-end release flow |

## Layout note

Each file ships with minimal inline `BPMNDiagram` layout so viewers can render immediately. If layout looks cramped, most editors offer **Edit → Auto Layout** to re-flow.
