#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_ENV_FILES = ['.env.local', '.env.production.local', '.env'];
const REQUIRED_CONFIRMATION = 'REMOVE-AUTH-FACTORS';
const applyChanges = process.argv.includes('--apply');
const explicitEnvFile = getArgValue('--env-file');
const confirmation = getArgValue('--confirm');

if (applyChanges && confirmation !== REQUIRED_CONFIRMATION) {
  throw new Error(
    `La suppression exige --confirm=${REQUIRED_CONFIRMATION}.`
  );
}

loadEnv(explicitEnvFile);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const initialFactors = await collectAuthFactors();
const countsByStatus = Object.fromEntries(
  [...new Set(initialFactors.map((entry) => entry.status))]
    .sort()
    .map((status) => [
      status,
      initialFactors.filter((entry) => entry.status === status).length,
    ])
);

console.log(
  `\nSuppression des facteurs d’authentification (${applyChanges ? 'apply' : 'dry-run'})`
);
console.log('------------------------------------------------------------');
console.log(`Facteurs détectés : ${initialFactors.length}`);

for (const [status, count] of Object.entries(countsByStatus)) {
  console.log(`- ${status} : ${count}`);
}

if (!applyChanges) {
  console.log(
    `\nAucune écriture effectuée. Relancez avec --apply --confirm=${REQUIRED_CONFIRMATION}.`
  );
  process.exit(0);
}

for (const { factorId, userId } of initialFactors) {
  const { error } = await supabase.auth.admin.mfa.deleteFactor({
    id: factorId,
    userId,
  });

  if (error) {
    throw new Error(`Suppression d’un facteur impossible : ${error.message}`);
  }
}

const remainingFactors = await collectAuthFactors();

if (remainingFactors.length > 0) {
  throw new Error(
    `${remainingFactors.length} facteur(s) subsistent après la suppression.`
  );
}

console.log(`\nSuppression confirmée : ${initialFactors.length} facteur(s) retiré(s).`);

async function collectAuthFactors() {
  const users = await listAllAuthUsers();
  const factors = [];

  for (const user of users) {
    const { data, error } = await supabase.auth.admin.mfa.listFactors({
      userId: user.id,
    });

    if (error) {
      throw new Error(`Lecture des facteurs impossible : ${error.message}`);
    }

    for (const factor of data?.factors ?? []) {
      if (!factor?.id) {
        continue;
      }

      factors.push({
        factorId: factor.id,
        status: String(factor.status ?? 'unknown'),
        userId: user.id,
      });
    }
  }

  return factors;
}

async function listAllAuthUsers() {
  const users = [];
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Lecture des comptes Auth impossible : ${error.message}`);
    }

    const pageUsers = data?.users ?? [];
    users.push(...pageUsers);

    if (pageUsers.length < perPage) {
      return users;
    }
  }
}

function getArgValue(name) {
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

function loadEnv(envFile) {
  const envFiles = envFile ? [envFile] : DEFAULT_ENV_FILES;
  const selectedEnvFile = envFiles
    .map((filePath) => resolve(process.cwd(), filePath))
    .find((filePath) => existsSync(filePath));

  if (!selectedEnvFile) {
    return;
  }

  const content = readFileSync(selectedEnvFile, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    if (key && process.env[key] == null) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}
