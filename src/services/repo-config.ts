// Deprecated compatibility module. Repo-centric execution has been replaced
// by DB-driven directories, commands, chain templates and command runs.

export const COMMANDS = [] as const;
export type CommandName = string;

export interface RepoConfig {
  name: string;
  path: string;
}

export const loadRepoConfigs = (): RepoConfig[] => {
  return [];
};

export const getRepoByName = (_repoName: string): RepoConfig | undefined => {
  return undefined;
};

export const getAllowedCommandsForRepo = (_repo: RepoConfig): CommandName[] => {
  return [];
};
