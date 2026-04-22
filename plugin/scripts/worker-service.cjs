#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { homedir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const sourcePath = resolve(__dirname, '../../src/services/worker-service.ts');

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
    // Fall back to common install paths.
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

function runViaBunSubprocess() {
  const bunPath = findBun();
  if (!bunPath) {
    console.error('Bun is required but was not found in PATH or common install locations.');
    console.error('Install Bun from https://bun.sh');
    process.exit(1);
  }

  const child = spawn(bunPath, [sourcePath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('error', (error) => {
    console.error(`Failed to launch worker service: ${error.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

if (!existsSync(sourcePath)) {
  console.error(`Worker service source not found at ${sourcePath}`);
  process.exit(1);
}

if (process.versions.bun) {
  import(pathToFileURL(sourcePath).href).catch((error) => {
    console.error(`Failed to load worker service module: ${error.message}`);
    process.exit(1);
  });
} else {
  runViaBunSubprocess();
}