import { ObjectId } from 'mongodb';
import { env } from '../config/env.js';
import { getDatabase } from '../config/db.js';
import { executeStepCommand, type StepShell } from './executor.js';
import { log } from './logger.js';

interface CommandRunStep {
  label: string;
  command: string;
  order: number;
  shell?: StepShell;
  runAsSystem?: boolean;
  timeoutMs?: number;
  completed: boolean;
  completedAt?: Date;
  error?: boolean;
  log?: string;
}

interface CommandRunRecord {
  _id: ObjectId;
  name?: string;
  directoryPath: string;
  steps: CommandRunStep[];
  completed: boolean;
  error?: boolean;
  failedStep?: string;
  addDate: Date;
  processing?: boolean;
  processingStartedAt?: Date;
}

let processing = false;

const collectionName = 'sc_command_runs';

const withSafeReleaseLock = async (commandRunId: ObjectId, errorMessage: string): Promise<void> => {
  const db = await getDatabase();

  await db.collection(collectionName).updateOne(
    { _id: commandRunId },
    {
      $set: {
        completed: true,
        processing: false,
        error: true,
        completedAt: new Date(),
        errorMessage
      }
    }
  );
};

const markCommandRunFailed = async (
  commandRunId: ObjectId,
  failedStep: CommandRunStep,
  output: string
): Promise<void> => {
  const db = await getDatabase();

  await db.collection(collectionName).updateOne(
    {
      _id: commandRunId,
      'steps.order': failedStep.order
    },
    {
      $set: {
        'steps.$.completed': true,
        'steps.$.completedAt': new Date(),
        'steps.$.error': true,
        'steps.$.log': output
      }
    }
  );

  await db.collection(collectionName).updateOne(
    { _id: commandRunId },
    {
      $set: {
        completed: true,
        error: true,
        completedAt: new Date(),
        failedStep: failedStep.label,
        processing: false
      }
    }
  );
};

const markStepSucceeded = async (commandRunId: ObjectId, step: CommandRunStep, output: string): Promise<void> => {
  const db = await getDatabase();

  await db.collection(collectionName).updateOne(
    {
      _id: commandRunId,
      'steps.order': step.order
    },
    {
      $set: {
        'steps.$.completed': true,
        'steps.$.completedAt': new Date(),
        'steps.$.error': false,
        'steps.$.log': output
      }
    }
  );
};

const markCommandRunCompleted = async (commandRunId: ObjectId): Promise<void> => {
  const db = await getDatabase();

  await db.collection(collectionName).updateOne(
    { _id: commandRunId },
    {
      $set: {
        completed: true,
        error: false,
        completedAt: new Date(),
        processing: false,
        failedStep: null,
        errorMessage: null
      }
    }
  );
};

const processSingleCommandRun = async (commandRun: CommandRunRecord): Promise<void> => {
  const sortedSteps = [...commandRun.steps].sort((a, b) => a.order - b.order);

  if (sortedSteps.length === 0) {
    await withSafeReleaseLock(commandRun._id, 'No executable steps found.');
    return;
  }

  for (const step of sortedSteps) {
    if (step.completed) {
      continue;
    }

    if (!step.command?.trim()) {
      await markCommandRunFailed(commandRun._id, step, 'Step command is empty.');
      return;
    }

    const result = await executeStepCommand(
      {
        label: step.label,
        command: step.command,
        shell: step.shell,
        runAsSystem: step.runAsSystem,
        timeoutMs: step.timeoutMs
      },
      commandRun.directoryPath
    );

    const stepOutput = [`$ ${result.executedCommand}`, result.output].filter(Boolean).join('\n\n');

    if (!result.success) {
      await markCommandRunFailed(commandRun._id, step, stepOutput);
      return;
    }

    await markStepSucceeded(commandRun._id, step, stepOutput);
  }

  await markCommandRunCompleted(commandRun._id);
};

const acquireLock = async (commandRunId: ObjectId): Promise<boolean> => {
  const db = await getDatabase();
  const staleTime = new Date(Date.now() - env.lockTimeoutMinutes * 60 * 1000);

  const result = await db.collection(collectionName).updateOne(
    {
      _id: commandRunId,
      $or: [
        { processing: { $exists: false } },
        { processing: false },
        { processingStartedAt: { $lt: staleTime } }
      ]
    },
    {
      $set: {
        processing: true,
        processingStartedAt: new Date()
      }
    }
  );

  return result.modifiedCount > 0;
};

const findPendingCommandRuns = async (): Promise<CommandRunRecord[]> => {
  const db = await getDatabase();
  const staleTime = new Date(Date.now() - env.lockTimeoutMinutes * 60 * 1000);

  return db
    .collection<CommandRunRecord>(collectionName)
    .find({
      completed: false,
      $or: [
        { processing: { $exists: false } },
        { processing: false },
        { processingStartedAt: { $lt: staleTime } }
      ]
    })
    .sort({ addDate: 1 })
    .toArray();
};

export const processPendingCommandRuns = async (): Promise<void> => {
  if (processing) {
    log('Command-run queue is already running, skipping this tick.', 'warn');
    return;
  }

  processing = true;

  try {
    const pending = await findPendingCommandRuns();

    for (const commandRun of pending) {
      const locked = await acquireLock(commandRun._id);
      if (!locked) {
        continue;
      }

      try {
        log(`Processing command run ${commandRun._id.toHexString()} in '${commandRun.directoryPath}'`);
        await processSingleCommandRun(commandRun);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown processing error.';
        log(`Command run ${commandRun._id.toHexString()} failed with unexpected error: ${message}`, 'error');
        await withSafeReleaseLock(commandRun._id, message);
      }
    }
  } finally {
    processing = false;
  }
};
