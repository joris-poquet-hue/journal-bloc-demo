#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DEFAULT_BACKUP_DIRECTORY,
  DEFAULT_SUPPORT_DIRECTORY,
  assertPostgresTools,
  getBackupKey,
  loadEnvironment,
  parseCliArguments,
  runCommand,
} from './external-backup-lib.mjs';

const args = parseCliArguments();
const projectDirectory = resolve(process.cwd());
const selectedEnvFile = await loadEnvironment({
  explicitEnvFile: args.get('env-file'),
});

if (!selectedEnvFile) {
  throw new Error(
    'Fichier d’environnement de production introuvable. Utilisez --env-file=/chemin/vers/.env.production.local.'
  );
}

if (!existsSync(join(projectDirectory, 'package.json'))) {
  throw new Error('Lancez cette commande depuis la racine de Project1.');
}

await assertPostgresTools();

const backupDirectory = resolve(
  String(args.get('backup-dir') || process.env.PROJECT1_BACKUP_DIR || DEFAULT_BACKUP_DIRECTORY)
);
const logsDirectory = join(DEFAULT_SUPPORT_DIRECTORY, 'logs');
const launchAgentsDirectory = join(homedir(), 'Library', 'LaunchAgents');
const launchAgentPath = join(
  launchAgentsDirectory,
  'com.project1.supabase-backup.plist'
);
const launchAgentTemplatePath = join(
  DEFAULT_SUPPORT_DIRECTORY,
  'com.project1.supabase-backup.plist'
);
const label = 'com.project1.supabase-backup';
const uid = process.getuid?.();
const enableSchedule = Boolean(args.get('enable-schedule'));

await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
await mkdir(logsDirectory, { recursive: true, mode: 0o700 });
await mkdir(launchAgentsDirectory, { recursive: true, mode: 0o700 });
await getBackupKey({ create: true });

const plist = buildLaunchAgentPlist({
  label,
  nodePath: process.execPath,
  projectDirectory,
  envFile: selectedEnvFile,
  backupDirectory,
  allowExternalExport: enableSchedule,
  stdoutPath: join(logsDirectory, 'backup.log'),
  stderrPath: join(logsDirectory, 'backup-error.log'),
});
await writeFile(launchAgentTemplatePath, plist, { mode: 0o600 });
await chmod(launchAgentTemplatePath, 0o600);

if (uid != null) {
  const domain = `gui/${uid}`;
  await runCommand('/bin/launchctl', [
    'bootout',
    domain,
    launchAgentPath,
  ]).catch(() => {});
  if (enableSchedule) {
    await writeFile(launchAgentPath, plist, { mode: 0o600 });
    await chmod(launchAgentPath, 0o600);
    await runCommand('/bin/launchctl', ['bootstrap', domain, launchAgentPath]);
  } else {
    await rm(launchAgentPath, { force: true });
  }
}

console.log(`Destination : ${backupDirectory}`);
console.log('Chiffrement : AES-256-GCM, clé conservée dans le Trousseau macOS.');
console.log(
  enableSchedule
    ? 'Planification active : tous les jours à 03:15 (ou au prochain réveil du Mac).'
    : 'Planification inactive : aucun export automatique ne sera exécuté.'
);
console.log(
  enableSchedule
    ? `Agent macOS : ${launchAgentPath}`
    : `Modèle d’agent prêt : ${launchAgentTemplatePath}`
);
console.log(
  'Important : exportez ensuite la clé de secours depuis un Terminal avec npm run backup:key:show.'
);

function buildLaunchAgentPlist({
  label,
  nodePath,
  projectDirectory,
  envFile,
  backupDirectory,
  allowExternalExport,
  stdoutPath,
  stderrPath,
}) {
  const values = {
    label,
    nodePath,
    projectDirectory,
    scriptPath: join(
      projectDirectory,
      'scripts',
      'run-external-backup-with-retry.mjs'
    ),
    envArgument: `--env-file=${envFile}`,
    backupArgument: `--backup-dir=${backupDirectory}`,
    allowExternalExport,
    stdoutPath,
    stderrPath,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(values.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(values.nodePath)}</string>
    <string>${escapeXml(values.scriptPath)}</string>
    <string>${escapeXml(values.envArgument)}</string>
    <string>${escapeXml(values.backupArgument)}</string>
    ${
      values.allowExternalExport
        ? '<string>--allow-external-production-backup</string>'
        : ''
    }
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(values.projectDirectory)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>3</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>3600</integer>
  <key>Umask</key>
  <integer>63</integer>
  <key>StandardOutPath</key>
  <string>${escapeXml(values.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(values.stderrPath)}</string>
</dict>
</plist>
`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
