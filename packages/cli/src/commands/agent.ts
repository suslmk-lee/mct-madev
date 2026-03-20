import chalk from 'chalk';
import { select, input, confirm, checkbox, editor } from '@inquirer/prompts';
import type { Agent, Project } from '@mct-madev/core';
import { AgentRole, ModelProvider } from '@mct-madev/core';

// ── API helper ─────────────────────────────────────────────────────

async function api<T>(port: number, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`http://localhost:${port}/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot connect to server at localhost:${port}. Is the server running?`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `API error: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Project selector ──────────────────────────────────────────────

async function selectProject(port: number): Promise<string> {
  const { data } = await api<{ data: Project[] }>(port, 'GET', '/projects');

  if (data.length === 0) {
    throw new Error('No projects found. Create one first with: mct-madev start');
  }

  if (data.length === 1) {
    console.log(chalk.gray(`Using project: ${data[0].name}`));
    return data[0].id;
  }

  return select({
    message: 'Select project:',
    choices: data.map((p) => ({
      name: `${p.name} (id: ${p.id.slice(0, 8)})`,
      value: p.id,
    })),
  });
}

// ── Agent selector ────────────────────────────────────────────────

async function selectAgent(port: number): Promise<Agent> {
  const projectId = await selectProject(port);
  const { data: agents } = await api<{ data: Agent[] }>(port, 'GET', `/projects/${projectId}/agents`);

  if (agents.length === 0) {
    throw new Error('No agents found in this project.');
  }

  const id = await select({
    message: 'Select agent:',
    choices: agents.map((a) => ({
      name: `${a.name} (${a.role}, ${a.provider}/${a.model})`,
      value: a.id,
    })),
  });

  return agents.find((a) => a.id === id)!;
}

// ── Constants ─────────────────────────────────────────────────────

const ROLES = Object.values(AgentRole) as string[];
const PROVIDERS = Object.values(ModelProvider) as string[];

// ── Model fetcher ─────────────────────────────────────────────────

interface OllamaTagsResponse {
  models: { name: string; size: number; details?: { parameter_size?: string } }[];
}

async function fetchOllamaModels(): Promise<string[]> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaTagsResponse;
    return data.models.map((m) => m.name);
  } catch {
    return [];
  }
}

async function selectModel(provider: string): Promise<string> {
  if (provider === 'ollama') {
    const models = await fetchOllamaModels();
    if (models.length > 0) {
      return select({
        message: 'Model:',
        choices: models.map((m) => ({ name: m, value: m })),
      });
    }
    console.log(chalk.yellow('Could not fetch Ollama models. Enter model name manually.'));
  }

  const model = await input({ message: 'Model:' });
  if (!model.trim()) throw new Error('Model is required.');
  return model.trim();
}

// ── Core functions (used by both CLI subcommands and interactive menu) ──

export async function doAgentAdd(port: number): Promise<void> {
  const projectId = await selectProject(port);

  const name = await input({ message: 'Agent name:' });
  if (!name.trim()) {
    console.log(chalk.red('Name is required.'));
    return;
  }

  const role = await select({
    message: 'Role:',
    choices: ROLES.map((r) => ({ name: r, value: r })),
  });

  const provider = await select({
    message: 'Provider:',
    choices: PROVIDERS.map((p) => ({ name: p, value: p })),
  });

  const model = await selectModel(provider);

  const systemPrompt = await input({ message: 'System prompt (optional, Enter to skip):' });

  const { data: agent } = await api<{ data: Agent }>(port, 'POST', `/projects/${projectId}/agents`, {
    name: name.trim(),
    role,
    provider,
    model: model.trim(),
    systemPrompt: systemPrompt.trim() || undefined,
  });

  console.log(chalk.green(`\n✓ Agent '${agent.name}' created`));
  console.log(`  ID:       ${agent.id}`);
  console.log(`  Role:     ${agent.role}`);
  console.log(`  Provider: ${agent.provider}`);
  console.log(`  Model:    ${agent.model}`);
}

export async function doAgentList(port: number): Promise<void> {
  const projectId = await selectProject(port);
  const { data: agents, total } = await api<{ data: Agent[]; total: number }>(
    port,
    'GET',
    `/projects/${projectId}/agents`,
  );

  if (agents.length === 0) {
    console.log(chalk.yellow('No agents found.'));
    return;
  }

  const header = ` ${'ID'.padEnd(10)} ${'Name'.padEnd(12)} ${'Role'.padEnd(12)} ${'Provider'.padEnd(12)} ${'Model'.padEnd(22)} ${'State'}`;
  console.log(chalk.bold(header));

  for (const a of agents) {
    const id = a.id.slice(0, 8);
    const stateColor = a.visualState === 'WORKING' ? chalk.green : chalk.gray;
    console.log(
      ` ${id.padEnd(10)} ${a.name.padEnd(12)} ${a.role.padEnd(12)} ${a.provider.padEnd(12)} ${a.model.padEnd(22)} ${stateColor(a.visualState)}`,
    );
  }

  console.log(`\nTotal: ${total} agents`);
}

export async function doAgentShow(port: number, id?: string): Promise<void> {
  let agent: Agent;
  if (id) {
    agent = (await api<{ data: Agent }>(port, 'GET', `/agents/${id}`)).data;
  } else {
    agent = await selectAgent(port);
  }

  console.log(`\nAgent: ${chalk.bold(agent.name)} (${agent.id})`);
  console.log(`  Role:          ${agent.role}`);
  console.log(`  Provider:      ${agent.provider}`);
  console.log(`  Model:         ${agent.model}`);
  console.log(`  Visual State:  ${agent.visualState}`);
  console.log(`  Position:      (${agent.position.x}, ${agent.position.y}, ${agent.position.z})`);
  console.log(`  System Prompt: ${agent.systemPrompt ?? chalk.gray('(none)')}`);
  console.log(`  Created:       ${agent.createdAt}`);
}

export async function doAgentUpdate(port: number, id?: string): Promise<void> {
  let agent: Agent;
  if (id) {
    agent = (await api<{ data: Agent }>(port, 'GET', `/agents/${id}`)).data;
  } else {
    agent = await selectAgent(port);
  }
  id = agent.id;

  console.log(`Current: ${agent.name} (${agent.role}, ${agent.provider}/${agent.model})`);

  const fields = await checkbox({
    message: 'What to update:',
    choices: [
      { name: 'Name', value: 'name' },
      { name: 'Model', value: 'model' },
      { name: 'Provider', value: 'provider' },
      { name: 'System Prompt', value: 'systemPrompt' },
    ],
  });

  if (fields.length === 0) {
    console.log(chalk.gray('Nothing selected.'));
    return;
  }

  const updates: Record<string, unknown> = {};

  // Process provider first so model selection can use updated provider
  if (fields.includes('provider')) {
    const v = await select({
      message: 'Provider:',
      choices: PROVIDERS.map((p) => ({ name: p, value: p })),
      default: agent.provider,
    });
    updates.provider = v;
  }

  for (const field of fields) {
    switch (field) {
      case 'name': {
        const v = await input({ message: 'Name:', default: agent.name });
        if (v.trim()) updates.name = v.trim();
        break;
      }
      case 'model': {
        const currentProvider = (updates.provider as string) ?? agent.provider;
        const v = await selectModel(currentProvider);
        updates.model = v;
        break;
      }
      case 'provider':
        // already handled above
        break;
      case 'systemPrompt': {
        const v = await editor({
          message: 'System Prompt:',
          default: agent.systemPrompt ?? '',
        });
        updates.systemPrompt = v.trim() || undefined;
        break;
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    console.log(chalk.gray('No changes.'));
    return;
  }

  await api(port, 'PUT', `/agents/${id}`, updates);
  console.log(chalk.green(`✓ Agent '${agent.name}' updated`));
}

export async function doAgentRemove(port: number, id?: string): Promise<void> {
  let agent: Agent;
  if (id) {
    agent = (await api<{ data: Agent }>(port, 'GET', `/agents/${id}`)).data;
  } else {
    agent = await selectAgent(port);
  }
  id = agent.id;

  const yes = await confirm({
    message: `Remove agent '${agent.name}' (${agent.role})?`,
    default: false,
  });

  if (!yes) {
    console.log(chalk.gray('Cancelled.'));
    return;
  }

  await api(port, 'DELETE', `/agents/${id}`);
  console.log(chalk.green('✓ Agent removed'));
}

// ── CLI subcommand wrappers ──────────────────────────────────────

interface AgentCommandOptions {
  port: string;
}

export async function agentAddCommand(options: AgentCommandOptions) {
  try {
    await doAgentAdd(parseInt(options.port, 10));
  } catch (err) {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
    process.exitCode = 1;
  }
}

export async function agentListCommand(options: AgentCommandOptions) {
  try {
    await doAgentList(parseInt(options.port, 10));
  } catch (err) {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
    process.exitCode = 1;
  }
}

export async function agentShowCommand(id: string, options: AgentCommandOptions) {
  try {
    await doAgentShow(parseInt(options.port, 10), id);
  } catch (err) {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
    process.exitCode = 1;
  }
}

export async function agentUpdateCommand(id: string, options: AgentCommandOptions) {
  try {
    await doAgentUpdate(parseInt(options.port, 10), id);
  } catch (err) {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
    process.exitCode = 1;
  }
}

export async function agentRemoveCommand(id: string, options: AgentCommandOptions) {
  try {
    await doAgentRemove(parseInt(options.port, 10), id);
  } catch (err) {
    console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
    process.exitCode = 1;
  }
}
