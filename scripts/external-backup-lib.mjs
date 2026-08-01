import {
  appendFile,
  chmod,
  copyFile,
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import { execFile } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';

const execFileAsync = promisify(execFile);

export const BACKUP_EXTENSION = '.p1backup';
export const BACKUP_FILE_PREFIX = 'project1-supabase-';
export const BACKUP_KEYCHAIN_ACCOUNT = 'archive-key-v1';
export const BACKUP_KEYCHAIN_SERVICE = 'com.project1.supabase-backup';
export const DEFAULT_BACKUP_DIRECTORY = join(
  homedir(),
  'Library',
  'Mobile Documents',
  'com~apple~CloudDocs',
  'Project1',
  'Sauvegardes Supabase'
);
export const DEFAULT_RETENTION_DAYS = 30;
export const DEFAULT_SUPPORT_DIRECTORY = join(
  homedir(),
  'Library',
  'Application Support',
  'Project1 Backup'
);
export const DEFAULT_POSTGRES_DIRECTORY = join(
  DEFAULT_SUPPORT_DIRECTORY,
  'postgresql-17'
);

const ENCRYPTION_MAGIC = Buffer.from('P1BKP001', 'ascii');
const ENCRYPTION_SALT_BYTES = 16;
const ENCRYPTION_IV_BYTES = 12;
const ENCRYPTION_TAG_BYTES = 16;
const ENCRYPTION_HEADER_BYTES =
  ENCRYPTION_MAGIC.length + ENCRYPTION_SALT_BYTES + ENCRYPTION_IV_BYTES;
const ENCRYPTION_INFO = Buffer.from('Project1 external backup v1', 'utf8');

export function parseCliArguments(argv = process.argv.slice(2)) {
  const result = new Map();

  for (const argument of argv) {
    if (!argument.startsWith('--')) {
      continue;
    }

    const separatorIndex = argument.indexOf('=');

    if (separatorIndex === -1) {
      result.set(argument.slice(2), true);
      continue;
    }

    result.set(
      argument.slice(2, separatorIndex),
      argument.slice(separatorIndex + 1)
    );
  }

  return result;
}

export async function loadEnvironment({
  explicitEnvFile,
  cwd = process.cwd(),
  defaults = ['.env.production.local', '.env.local', '.env'],
  override = false,
} = {}) {
  const candidates = explicitEnvFile
    ? [resolve(cwd, explicitEnvFile)]
    : defaults.map((filePath) => resolve(cwd, filePath));
  const selectedFile = candidates.find((filePath) => existsSync(filePath));

  if (!selectedFile) {
    return null;
  }

  const content = await readFile(selectedFile, 'utf8');

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

    if (!key || (!override && process.env[key] != null)) {
      continue;
    }

    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return selectedFile;
}

export function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Variable d’environnement manquante : ${name}.`);
  }

  return value;
}

export function getPostgresConnectionString() {
  const value =
    process.env.SUPABASE_POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.SUPABASE_POSTGRES_URL?.trim();

  if (!value) {
    throw new Error(
      'Variable d’environnement manquante : SUPABASE_POSTGRES_URL_NON_POOLING ou SUPABASE_POSTGRES_URL.'
    );
  }

  return value;
}

export function getPostgresProcessEnvironment(connectionString) {
  const url = new URL(connectionString);

  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '') || 'postgres'),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: 'require',
  };
}

export function stripSslMode(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return url.toString();
}

export function extractProjectReference(supabaseUrl) {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    return hostname.endsWith('.supabase.co')
      ? hostname.slice(0, -'.supabase.co'.length)
      : hostname;
  } catch {
    return 'inconnu';
  }
}

export function postgresExecutable(name) {
  const customDirectory = process.env.PROJECT1_POSTGRES_DIRECTORY?.trim();
  return join(customDirectory || DEFAULT_POSTGRES_DIRECTORY, 'bin', name);
}

export async function assertPostgresTools() {
  for (const executableName of ['pg_dump', 'pg_restore', 'psql']) {
    const executablePath = postgresExecutable(executableName);

    if (!existsSync(executablePath)) {
      throw new Error(
        `Outil PostgreSQL absent : ${executablePath}. Lancez d’abord npm run backup:setup.`
      );
    }

    await runCommand(executablePath, ['--version']);
  }
}

export async function runCommand(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    const stderr = error?.stderr?.trim();
    const stdout = error?.stdout?.trim();
    const detail = stderr || stdout || error?.message || 'erreur inconnue';
    throw new Error(`${basename(command)} a échoué : ${detail}`);
  }
}

export async function createPrivateTemporaryDirectory(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await chmod(directory, 0o700);
  return directory;
}

export async function getBackupKey({ create = false } = {}) {
  try {
    const { stdout } = await execFileAsync('/usr/bin/security', [
      'find-generic-password',
      '-a',
      BACKUP_KEYCHAIN_ACCOUNT,
      '-s',
      BACKUP_KEYCHAIN_SERVICE,
      '-w',
    ]);
    return parseBackupKey(stdout.trim());
  } catch (error) {
    if (!create) {
      throw new Error(
        'Clé de sauvegarde absente du Trousseau macOS. Lancez npm run backup:setup.'
      );
    }
  }

  const encodedKey = randomBytes(32).toString('base64');
  await execFileAsync('/usr/bin/security', [
    'add-generic-password',
    '-U',
    '-a',
    BACKUP_KEYCHAIN_ACCOUNT,
    '-s',
    BACKUP_KEYCHAIN_SERVICE,
    '-w',
    encodedKey,
  ]);

  return parseBackupKey(encodedKey);
}

export async function readEncodedBackupKey() {
  const { stdout } = await execFileAsync('/usr/bin/security', [
    'find-generic-password',
    '-a',
    BACKUP_KEYCHAIN_ACCOUNT,
    '-s',
    BACKUP_KEYCHAIN_SERVICE,
    '-w',
  ]);
  parseBackupKey(stdout.trim());
  return stdout.trim();
}

function parseBackupKey(value) {
  const key = Buffer.from(value, 'base64');

  if (key.length !== 32) {
    throw new Error('La clé de sauvegarde du Trousseau est invalide.');
  }

  return key;
}

function deriveArchiveKey(masterKey, salt) {
  return Buffer.from(
    hkdfSync('sha256', masterKey, salt, ENCRYPTION_INFO, 32)
  );
}

export async function encryptFile(inputPath, outputPath, masterKey) {
  const salt = randomBytes(ENCRYPTION_SALT_BYTES);
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const archiveKey = deriveArchiveKey(masterKey, salt);
  const cipher = createCipheriv('aes-256-gcm', archiveKey, iv);

  await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(
    outputPath,
    Buffer.concat([ENCRYPTION_MAGIC, salt, iv]),
    { mode: 0o600 }
  );
  await pipeline(
    createReadStream(inputPath),
    cipher,
    createWriteStream(outputPath, { flags: 'a', mode: 0o600 })
  );
  await appendFile(outputPath, cipher.getAuthTag());
}

export async function decryptFile(inputPath, outputPath, masterKey) {
  const fileStats = await stat(inputPath);

  if (fileStats.size <= ENCRYPTION_HEADER_BYTES + ENCRYPTION_TAG_BYTES) {
    throw new Error('Archive chiffrée tronquée.');
  }

  const fileHandle = await open(inputPath, 'r');
  const header = Buffer.alloc(ENCRYPTION_HEADER_BYTES);
  const authTag = Buffer.alloc(ENCRYPTION_TAG_BYTES);

  try {
    await fileHandle.read(header, 0, header.length, 0);
    await fileHandle.read(
      authTag,
      0,
      authTag.length,
      fileStats.size - ENCRYPTION_TAG_BYTES
    );
  } finally {
    await fileHandle.close();
  }

  if (!header.subarray(0, ENCRYPTION_MAGIC.length).equals(ENCRYPTION_MAGIC)) {
    throw new Error('Format de sauvegarde Project1 non reconnu.');
  }

  const salt = header.subarray(
    ENCRYPTION_MAGIC.length,
    ENCRYPTION_MAGIC.length + ENCRYPTION_SALT_BYTES
  );
  const iv = header.subarray(
    ENCRYPTION_MAGIC.length + ENCRYPTION_SALT_BYTES
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveArchiveKey(masterKey, salt),
    iv
  );
  decipher.setAuthTag(authTag);

  await pipeline(
    createReadStream(inputPath, {
      start: ENCRYPTION_HEADER_BYTES,
      end: fileStats.size - ENCRYPTION_TAG_BYTES - 1,
    }),
    decipher,
    createWriteStream(outputPath, { mode: 0o600 })
  );
}

export async function sha256File(filePath) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

export async function listRegularFiles(rootDirectory) {
  const result = [];

  async function visit(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = join(currentDirectory, entry.name);
      const relativePath = relative(rootDirectory, absolutePath).split(sep).join('/');

      if (entry.isSymbolicLink()) {
        throw new Error(`Lien symbolique interdit dans la sauvegarde : ${relativePath}`);
      }

      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile()) {
        result.push({ absolutePath, relativePath });
      }
    }
  }

  await visit(rootDirectory);
  return result.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

export async function buildFileInventory(rootDirectory, excluded = []) {
  const excludedSet = new Set(excluded);
  const files = await listRegularFiles(rootDirectory);
  const inventory = [];

  for (const file of files) {
    if (excludedSet.has(file.relativePath)) {
      continue;
    }

    const fileStats = await stat(file.absolutePath);
    inventory.push({
      path: file.relativePath,
      bytes: fileStats.size,
      sha256: await sha256File(file.absolutePath),
    });
  }

  return inventory;
}

export async function createTarGzip(sourceDirectory, outputPath) {
  await runCommand('/usr/bin/tar', [
    '-czf',
    outputPath,
    '-C',
    sourceDirectory,
    '.',
  ]);
}

export async function extractTarGzipSafely(archivePath, outputDirectory) {
  const { stdout } = await runCommand('/usr/bin/tar', ['-tzf', archivePath]);
  const entries = stdout.split(/\r?\n/).filter(Boolean);

  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//, '');

    if (
      normalized.startsWith('/') ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.includes('/../')
    ) {
      throw new Error(`Chemin dangereux détecté dans l’archive : ${entry}`);
    }
  }

  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await runCommand('/usr/bin/tar', ['-xzf', archivePath, '-C', outputDirectory]);

  for (const file of await listRegularFiles(outputDirectory)) {
    const metadata = await lstat(file.absolutePath);
    if (!metadata.isFile()) {
      throw new Error(`Entrée non régulière dans l’archive : ${file.relativePath}`);
    }
  }
}

export async function verifyExtractedPayload(payloadDirectory) {
  const manifestPath = join(payloadDirectory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  if (manifest.format !== 'project1-external-backup' || manifest.version !== 1) {
    throw new Error('Manifest de sauvegarde Project1 invalide.');
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Inventaire de fichiers absent du manifest.');
  }

  for (const entry of manifest.files) {
    const absolutePath = resolve(payloadDirectory, entry.path);
    const relativePath = relative(payloadDirectory, absolutePath);

    if (relativePath.startsWith('..') || relativePath === '') {
      throw new Error(`Chemin invalide dans le manifest : ${entry.path}`);
    }

    const fileStats = await stat(absolutePath);

    if (fileStats.size !== entry.bytes) {
      throw new Error(`Taille invalide pour ${entry.path}.`);
    }

    if ((await sha256File(absolutePath)) !== entry.sha256) {
      throw new Error(`Somme SHA-256 invalide pour ${entry.path}.`);
    }
  }

  return manifest;
}

export async function decryptAndVerifyBackup(backupPath, masterKey) {
  const temporaryDirectory = await createPrivateTemporaryDirectory(
    'project1-verify-'
  );
  const tarPath = join(temporaryDirectory, 'payload.tar.gz');
  const extractedDirectory = join(temporaryDirectory, 'payload');

  try {
    await decryptFile(backupPath, tarPath, masterKey);
    await extractTarGzipSafely(tarPath, extractedDirectory);
    const manifest = await verifyExtractedPayload(extractedDirectory);
    return { manifest, extractedDirectory, temporaryDirectory };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function copyMigrations(sourceDirectory, targetDirectory) {
  await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries
    .filter((candidate) => candidate.isFile() && candidate.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    await copyFile(
      join(sourceDirectory, entry.name),
      join(targetDirectory, entry.name)
    );
  }
}

export async function enforceRetention(
  backupDirectory,
  retentionDays = DEFAULT_RETENTION_DAYS
) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await readdir(backupDirectory, { withFileTypes: true });
  const removed = [];

  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.startsWith(BACKUP_FILE_PREFIX) ||
      !entry.name.endsWith(BACKUP_EXTENSION)
    ) {
      continue;
    }

    const absolutePath = join(backupDirectory, entry.name);
    const fileStats = await stat(absolutePath);

    if (fileStats.mtimeMs < cutoff) {
      await rm(absolutePath);
      removed.push(entry.name);
    }
  }

  return removed;
}

export async function findLatestBackup(backupDirectory = DEFAULT_BACKUP_DIRECTORY) {
  const entries = await readdir(backupDirectory, { withFileTypes: true });
  const candidates = [];

  for (const entry of entries) {
    if (
      entry.isFile() &&
      entry.name.startsWith(BACKUP_FILE_PREFIX) &&
      entry.name.endsWith(BACKUP_EXTENSION)
    ) {
      const absolutePath = join(backupDirectory, entry.name);
      candidates.push({ absolutePath, stats: await stat(absolutePath) });
    }
  }

  candidates.sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs);
  return candidates[0]?.absolutePath ?? null;
}

export function formatBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export async function atomicMove(sourcePath, targetPath) {
  await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
  await rename(sourcePath, targetPath);
  await chmod(targetPath, 0o600);
}

export async function removeTemporaryDirectory(path) {
  await rm(path, { recursive: true, force: true });
}
