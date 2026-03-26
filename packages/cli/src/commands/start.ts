import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import chalk from 'chalk';
import open from 'open';
import { interactiveMenu } from './menu.js';
import { SqliteDatabase } from '@mct-madev/db';
import {
  ModelGateway,
  AnthropicProvider,
  OpenAIProvider,
  GoogleProvider,
  OllamaProvider,
} from '@mct-madev/gateway';
import { Orchestrator, SkillLoader, type GatewayChatFn } from '@mct-madev/core';
import { createServer, createEventBridge, setupSubscribeSync } from '@mct-madev/server';

interface StartOptions {
  port: string;
  open: boolean;
}

function findWebDist(): string | undefined {
  const __dir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dir, '..', '..', '..', 'apps', 'web', 'dist'), // dev monorepo
    resolve(__dir, '..', '..', 'web', 'dist'), // bundled
    resolve(process.cwd(), 'apps', 'web', 'dist'),
  ];
  return candidates.find((p) => existsSync(p));
}

async function setupGateway(): Promise<ModelGateway> {
  const gateway = new ModelGateway();

  // Auto-detect available providers from environment
  if (process.env.ANTHROPIC_API_KEY) {
    gateway.registerProvider(new AnthropicProvider());
    console.log(chalk.dim('  ✓ Anthropic provider registered'));
  }
  if (process.env.OPENAI_API_KEY) {
    gateway.registerProvider(new OpenAIProvider());
    console.log(chalk.dim('  ✓ OpenAI provider registered'));
  }
  if (process.env.GOOGLE_API_KEY) {
    gateway.registerProvider(new GoogleProvider());
    console.log(chalk.dim('  ✓ Google provider registered'));
  }

  // Ollama: register if env var is set OR if local Ollama is reachable
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_HOST) {
    gateway.registerProvider(new OllamaProvider());
    console.log(chalk.dim('  ✓ Ollama provider registered'));
  } else {
    try {
      const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        gateway.registerProvider(new OllamaProvider());
        console.log(chalk.dim('  ✓ Ollama provider registered (auto-detected at localhost:11434)'));
      }
    } catch {
      // Ollama not running locally, skip
    }
  }

  const providers = gateway.listProviders();
  if (providers.length === 0) {
    console.log(chalk.yellow('  ⚠ No AI providers configured. Set API keys to enable AI features.'));
    console.log(chalk.dim('    Supported: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, OLLAMA_BASE_URL'));
  }

  return gateway;
}

export async function startCommand(options: StartOptions) {
  const port = parseInt(options.port, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(chalk.red(`Invalid port: ${options.port}`));
    process.exit(1);
  }

  console.log(chalk.blue('Starting MCT-MADEV server...'));

  try {
    // 1. Initialize database
    const dataDir = resolve(process.cwd(), '.mct-madev');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = resolve(dataDir, 'data.db');
    const db = new SqliteDatabase(dbPath);
    await db.initialize();
    console.log(chalk.dim(`  ✓ Database initialized at ${dbPath}`));

    // 2. Setup gateway with auto-detected providers
    const gateway = await setupGateway();

    // 3. Load skills and guidelines
    const skillLoader = new SkillLoader();
    const guidelines = skillLoader.loadGuidelines();
    if (guidelines) {
      console.log(chalk.dim(`  ✓ Guidelines loaded from ${guidelines.filePath}`));
    }
    const allSkills = skillLoader.loadSkills();
    if (allSkills.length > 0) {
      console.log(chalk.dim(`  ✓ ${allSkills.length} skill(s) loaded from ${skillLoader.paths.skillsDir}`));
    }

    // 4. Create event emitter for orchestrator → WS bridge
    const emitter = new EventEmitter();

    // 5. Create orchestrator
    const chatFn: GatewayChatFn = async (provider, model, messages, systemPrompt, options) => {
      // Inject guidelines into system prompt
      let finalSystemPrompt = systemPrompt ?? '';
      if (guidelines) {
        finalSystemPrompt = guidelines.content + '\n\n' + finalSystemPrompt;
      }

      const chatMessages = finalSystemPrompt
        ? [{ role: 'system' as const, content: finalSystemPrompt }, ...messages]
        : messages;
      return gateway.chat(chatMessages, { provider: provider as never, model }, options);
    };

    const orchestrator = new Orchestrator({
      db,
      chat: chatFn,
      eventEmitter: emitter,
    });
    console.log(chalk.dim('  ✓ Orchestrator initialized'));

    // 6. Kill any existing process on the port before creating the server
    {
      const { execSync } = await import('node:child_process');
      try {
        let occupied = false;
        if (process.platform === 'win32') {
          const result = execSync(
            `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`,
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
          ).trim();
          if (result) {
            occupied = true;
            const pids = [...new Set(result.split(/\s+/).filter(Boolean))];
            for (const pid of pids) {
              execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
            }
          }
        } else {
          try {
            execSync(`lsof -ti tcp:${port} | xargs kill -9`, { stdio: 'ignore' });
            occupied = true;
          } catch { /* port was free */ }
        }
        if (occupied) {
          console.log(chalk.yellow(`  ⚠ Killed existing process on port ${port}`));
          await new Promise((r) => setTimeout(r, 800));
        }
      } catch { /* ignore */ }
    }

    // 7. Create server with all dependencies
    const staticDir = findWebDist();
    if (staticDir) {
      console.log(chalk.dim(`  ✓ Serving UI from ${staticDir}`));
    }

    const instance = createServer({
      port,
      staticDir,
      db,
      orchestrator,
      chatFn,
      skillLoader,
    });

    // 8. Setup event bridge (orchestrator events → WS clients)
    createEventBridge(emitter, instance.wss, db);
    setupSubscribeSync(instance.wss, db);
    console.log(chalk.dim('  ✓ Event bridge connected'));

    // 9. Start listening
    const { port: actualPort } = await instance.listen(port);
    const url = `http://localhost:${actualPort}`;

    console.log('');
    console.log(chalk.green.bold('  MCT-MADEV is running!'));
    console.log('');
    console.log(`  ${chalk.dim('API:')}     ${chalk.cyan(`${url}/api/health`)}`);
    console.log(`  ${chalk.dim('UI:')}      ${chalk.cyan(url)}`);
    console.log(`  ${chalk.dim('WS:')}      ${chalk.cyan(`ws://localhost:${actualPort}/ws`)}`);
    console.log('');
    console.log(chalk.dim('  Press Ctrl+C to stop'));
    console.log('');

    if (options.open) {
      open(url).catch(() => {
        console.log(chalk.yellow(`Could not open browser. Visit ${url} manually.`));
      });
    }

    // 9. Graceful shutdown (idempotent)
    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(chalk.yellow('\nShutting down...'));
      try {
        await instance.close();
        await db.close();
        console.log(chalk.green('Server stopped.'));
      } catch {
        // ignore close errors
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // 10. Ensure a default project exists, set repoPath to cwd
    const cwd = process.cwd();
    const projects = await db.listProjects();
    if (projects.length === 0) {
      const defaultProject = await db.createProject({
        name: 'default',
        description: 'Default project',
        repoPath: cwd,
        config: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-5',
          gitEnabled: false,
          maxConcurrentTasks: 5,
        },
      });
      console.log(chalk.dim(`  ✓ Default project created (${defaultProject.id.slice(0, 8)})`));
      console.log(chalk.dim(`  ✓ Workspace: ${cwd}`));
    } else {
      // Update repoPath if not set on existing projects
      for (const p of projects) {
        if (!p.repoPath) {
          await db.updateProject(p.id, { repoPath: cwd });
          console.log(chalk.dim(`  ✓ Updated workspace path for '${p.name}': ${cwd}`));
        }
      }
    }

    // 11. Interactive menu loop
    await interactiveMenu(actualPort);
    await shutdown();
  } catch (err) {
    console.error(chalk.red('Failed to start server:'), err);
    process.exit(1);
  }
}
