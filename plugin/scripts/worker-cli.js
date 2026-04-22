#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workerServicePath = join(scriptDir, 'worker-service.cjs');

const VALID_COMMANDS = new Set(['start', 'stop', 'restart', 'status']);

function findBun() {
  if (process.env.BUN && existsSync(process.env.BUN)) {
    return process.env.BUN;
  }

  try {
    const probe = spawnSync('bun', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
    if (probe.status === 0) {
      return 'bun';
    }
  } catch {
    // Fall through to common install paths.
  }

  const bunPaths = process.platform === 'win32'
    ? [join(homedir(), '.bun', 'bin', 'bun.exe')]
    : [
      join(homedir(), '.bun', 'bin', 'bun'),
      '/usr/local/bin/bun',
      '/opt/homebrew/bin/bun',
      '/home/linuxbrew/.linuxbrew/bin/bun',
    ];

  return bunPaths.find(existsSync) ?? null;
}

function main() {
  const command = process.argv[2];
  if (!command || !VALID_COMMANDS.has(command)) {
    console.error('Usage: worker-cli.js <start|stop|restart|status>');
    process.exit(1);
  }

  if (!existsSync(workerServicePath)) {
    console.error(`Worker script not found at ${workerServicePath}`);
    process.exit(1);
  }

  const bunPath = findBun();
  if (!bunPath) {
    console.error('Bun is required but was not found in PATH or common install locations.');
    console.error('Install Bun from https://bun.sh');
    process.exit(1);
  }

  const child = spawn(bunPath, [workerServicePath, command], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    console.error(`Failed to run worker command: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

main();
