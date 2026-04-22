'use strict';

const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const sourcePath = resolve(__dirname, '../../src/services/context-generator.ts');
let modulePromise;

async function loadSourceModule() {
  if (!existsSync(sourcePath)) {
    throw new Error(`Context generator source not found at ${sourcePath}`);
  }

  if (!process.versions.bun) {
    throw new Error('context-generator.cjs requires Bun to load TypeScript source modules.');
  }

  if (!modulePromise) {
    modulePromise = import(pathToFileURL(sourcePath).href);
  }

  return modulePromise;
}

module.exports = {
  async generateContext(...args) {
    const mod = await loadSourceModule();
    return mod.generateContext(...args);
  },
};