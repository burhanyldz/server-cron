# Server Cron

Standalone worker that executes queued command runs from `sc_command_runs`.

## Stack

- Node.js
- TypeScript
- MongoDB driver
- node-cron

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create `.env` from `.env.example`.
3. Start worker:
   ```bash
   npm run dev
   ```

Polling is configured with `COMMAND_RUN_POLL_CRON` (default every minute).

## Windows SYSTEM execution

For elevated NT AUTHORITY\\SYSTEM execution, configure wrapper command:

```env
SYSTEM_COMMAND_WRAPPER=psexec -accepteula -s {command}
SYSTEM_COMMAND_STRICT=true
```

Each step can toggle `runAsSystem`; when enabled, cron wraps the generated shell command using `SYSTEM_COMMAND_WRAPPER`.
