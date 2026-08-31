/**
 * claude-mem — public library entry point.
 *
 * Re-exports the stable SDK surface: observation/summary XML parsing and the
 * prompt builders used to drive the memory worker. This is the module resolved
 * by `import ... from 'claude-mem'`; the identical surface is also published at
 * the `claude-mem/sdk` subpath.
 *
 * Note: installing the npm package alone provides this library only — it does
 * not register the Claude Code plugin hooks or the worker service. Use
 * `npx claude-mem install` for the full plugin. See README.md.
 */
export * from './sdk/index.js';
