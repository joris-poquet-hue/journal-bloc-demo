#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_RETRY_DELAYS_MS = [0, 60_000, 180_000];
const retryDelays = parseRetryDelays(
  process.env.PROJECT1_BACKUP_RETRY_DELAYS_MS
);
const backupScript = join(
  dirname(fileURLToPath(import.meta.url)),
  'backup-external.mjs'
);

for (const [index, delayMs] of retryDelays.entries()) {
  const attempt = index + 1;

  if (delayMs > 0) {
    console.error(
      `[${new Date().toISOString()}] Nouvelle tentative de sauvegarde dans ${Math.round(
        delayMs / 1000
      )} secondes.`
    );
    await wait(delayMs);
  }

  console.log(
    `[${new Date().toISOString()}] Sauvegarde automatique — tentative ${attempt}/${retryDelays.length}.`
  );
  const result = await runBackup(backupScript, process.argv.slice(2));

  if (result.code === 0) {
    console.log(
      `[${new Date().toISOString()}] Sauvegarde automatique terminée avec succès.`
    );
    process.exit(0);
  }

  console.error(
    `[${new Date().toISOString()}] Tentative ${attempt} en échec${
      result.signal ? ` (${result.signal})` : ` (code ${result.code ?? 1})`
    }.`
  );
}

console.error(
  `[${new Date().toISOString()}] Toutes les tentatives de sauvegarde ont échoué.`
);
process.exit(1);

function parseRetryDelays(value) {
  if (!value?.trim()) {
    return DEFAULT_RETRY_DELAYS_MS;
  }

  const parsed = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry >= 0);

  return parsed.length > 0 ? parsed : DEFAULT_RETRY_DELAYS_MS;
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function runBackup(scriptPath, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      console.error(
        `Impossible de lancer la sauvegarde : ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      resolve({ code: 1, signal: null });
    });
    child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });
}
