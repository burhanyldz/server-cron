import { schedule } from 'node-cron';
import { connectToDatabase } from './config/db.js';
import { env } from './config/env.js';
import { log } from './services/logger.js';
import { processPendingCommandRuns } from './services/pull-request-processor.js';

const bootstrap = async (): Promise<void> => {
  await connectToDatabase();

  log('Server cron started. Waiting for queued command runs.');

  await processPendingCommandRuns();

  schedule(env.pullRequestPollCron, async () => {
    await processPendingCommandRuns();
  });

  log(`Command-run polling scheduled with cron: '${env.pullRequestPollCron}'`);
};

bootstrap().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log(`Failed to bootstrap server-cron: ${message}`, 'error');
  process.exit(1);
});
