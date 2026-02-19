import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env.js';
import { log } from './logger.js';

const execAsync = promisify(exec);

export type StepShell = 'cmd' | 'powershell' | 'bash';

export interface ExecutableStep {
  label: string;
  command: string;
  shell?: StepShell;
  runAsSystem?: boolean;
  timeoutMs?: number;
}

export interface CommandExecutionResult {
  success: boolean;
  output: string;
  executedCommand: string;
}

const isWindows = process.platform === 'win32';

const quoteForSh = (value: string): string => {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
};

const quoteForCmdDouble = (value: string): string => {
  return `"${value.replace(/"/g, '\\"')}"`;
};

const escapeForPowerShell = (value: string): string => {
  return value.replace(/`/g, '``').replace(/"/g, '`"');
};

const buildShellCommand = (step: ExecutableStep): string => {
  const shell = step.shell ?? 'cmd';

  if (shell === 'bash') {
    if (isWindows) {
      return `bash -lc ${quoteForSh(step.command)}`;
    }

    return `bash -lc ${quoteForSh(step.command)}`;
  }

  if (shell === 'powershell') {
    if (isWindows) {
      return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"${escapeForPowerShell(step.command)}\"`;
    }

    return `pwsh -NoProfile -Command ${quoteForSh(step.command)}`;
  }

  if (isWindows) {
    return `cmd.exe /d /s /c ${quoteForCmdDouble(step.command)}`;
  }

  return `sh -lc ${quoteForSh(step.command)}`;
};

const applySystemWrapper = (commandToRun: string, runAsSystem: boolean): string => {
  if (!runAsSystem) {
    return commandToRun;
  }

  if (!env.systemCommandWrapper) {
    if (env.systemCommandStrict) {
      throw new Error(
        'runAsSystem=true but SYSTEM_COMMAND_WRAPPER is not configured. Set wrapper or disable SYSTEM_COMMAND_STRICT.'
      );
    }

    return commandToRun;
  }

  if (env.systemCommandWrapper.includes('{command}')) {
    return env.systemCommandWrapper.replace('{command}', commandToRun);
  }

  return `${env.systemCommandWrapper} ${quoteForSh(commandToRun)}`;
};

export const executeStepCommand = async (
  step: ExecutableStep,
  directoryPath: string
): Promise<CommandExecutionResult> => {
  const shellCommand = buildShellCommand(step);
  const wrappedCommand = applySystemWrapper(shellCommand, step.runAsSystem ?? true);

  log(`Executing step '${step.label}' in '${directoryPath}'`);

  try {
    const { stdout, stderr } = await execAsync(wrappedCommand, {
      cwd: directoryPath,
      timeout: step.timeoutMs ?? env.commandTimeoutMs,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    });

    const output = [stdout, stderr].filter(Boolean).join('\n').trim();

    return {
      success: true,
      output: output || 'Command completed successfully.',
      executedCommand: wrappedCommand
    };
  } catch (error) {
    const err = error as Error & {
      stdout?: string;
      stderr?: string;
      message: string;
    };

    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').trim();

    return {
      success: false,
      output: output || 'Command execution failed.',
      executedCommand: wrappedCommand
    };
  }
};
