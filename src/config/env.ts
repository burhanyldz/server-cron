import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const currentDir = dirname(fileURLToPath(import.meta.url));
const envFilePath = resolve(currentDir, '../../.env');
dotenv.config({ path: envFilePath });

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value in environment: ${value}`);
  }

  return parsed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongoUri: process.env.MONGODB_URI ?? '',
  mongoDbName: process.env.MONGODB_DB_NAME ?? 'server_commands',
  commandRunPollCron: process.env.COMMAND_RUN_POLL_CRON ?? '* * * * *',
  lockTimeoutMinutes: parseNumber(process.env.LOCK_TIMEOUT_MINUTES, 10),
  commandTimeoutMs: parseNumber(process.env.COMMAND_TIMEOUT_MS, 300_000),
  systemCommandWrapper: process.env.SYSTEM_COMMAND_WRAPPER ?? '',
  systemCommandStrict: parseBoolean(process.env.SYSTEM_COMMAND_STRICT, false)
};

if (!env.mongoUri) {
  throw new Error('Missing required environment variable: MONGODB_URI');
}
