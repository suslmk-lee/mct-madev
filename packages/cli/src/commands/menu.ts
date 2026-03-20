import chalk from 'chalk';
import { select, input } from '@inquirer/prompts';
import { Separator } from '@inquirer/prompts';
import {
  doAgentAdd,
  doAgentList,
  doAgentShow,
  doAgentUpdate,
  doAgentRemove,
} from './agent.js';
import {
  doSkillInit,
  doSkillList,
  doSkillAdd,
  doSkillShow,
  doSkillRemove,
  doSkillValidate,
} from './skill.js';

// ── API helper ────────────────────────────────────────────────────

async function api(port: number, method: string, path: string, body?: unknown) {
  const res = await fetch(`http://localhost:${port}/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Project helpers ───────────────────────────────────────────────

async function getProjectId(port: number): Promise<string> {
  const { data } = (await api(port, 'GET', '/projects')) as { data: { id: string; name: string }[] };
  if (data.length === 0) throw new Error('No projects found.');
  if (data.length === 1) return data[0].id;
  return select({
    message: 'Select project:',
    choices: data.map((p) => ({ name: p.name, value: p.id })),
  });
}

async function doProjectList(port: number): Promise<void> {
  const { data } = (await api(port, 'GET', '/projects')) as { data: { id: string; name: string; description?: string; createdAt: string }[] };

  if (data.length === 0) {
    console.log(chalk.yellow('No projects found.'));
    return;
  }

  const header = ` ${'ID'.padEnd(10)} ${'Name'.padEnd(20)} ${'Description'.padEnd(30)} ${'Created'}`;
  console.log(chalk.bold(header));
  for (const p of data) {
    console.log(
      ` ${p.id.slice(0, 8).padEnd(10)} ${p.name.padEnd(20)} ${(p.description ?? '').padEnd(30)} ${p.createdAt}`,
    );
  }
  console.log(`\nTotal: ${data.length} projects`);
}

async function doProjectCreate(port: number): Promise<void> {
  const name = await input({ message: 'Project name:' });
  if (!name.trim()) {
    console.log(chalk.red('Name is required.'));
    return;
  }
  const description = await input({ message: 'Description (optional):' });
  const repoPath = await input({ message: 'Workspace path (optional, e.g. /path/to/project):' });

  const { data } = (await api(port, 'POST', '/projects', {
    name: name.trim(),
    description: description.trim() || undefined,
    repoPath: repoPath.trim() || undefined,
    config: {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-sonnet-4-5',
      gitEnabled: false,
      maxConcurrentTasks: 5,
    },
  })) as { data: { id: string; name: string } };
  console.log(chalk.green(`\n✓ Project '${data.name}' created (${data.id.slice(0, 8)})`));
}

// ── Chat (CEO ↔ PM) ──────────────────────────────────────────────

async function doChat(port: number): Promise<void> {
  const projectId = await getProjectId(port);

  console.log(chalk.cyan('\n  Chat with PM (type "exit" to return to menu)\n'));

  while (true) {
    let message: string;
    try {
      message = await input({ message: chalk.yellow('You:') });
    } catch {
      break;
    }

    if (!message.trim() || message.trim().toLowerCase() === 'exit') break;

    console.log(chalk.dim('  PM is thinking...'));

    const result = (await api(port, 'POST', `/projects/${projectId}/chat`, {
      message: message.trim(),
    })) as {
      data?: {
        intent: string;
        response: string;
        subtasks: { title: string; assigneeName?: string }[];
      };
      error?: string;
    };

    if (result.error) {
      console.log(chalk.red(`  Error: ${result.error}`));
      continue;
    }

    const { data } = result;
    if (!data) continue;

    const intentTag = data.intent === 'directive' ? chalk.bgBlue(' TASK ') : chalk.bgGray(' CHAT ');
    console.log(`\n  ${intentTag} ${chalk.bold('PM:')} ${data.response}\n`);

    if (data.subtasks && data.subtasks.length > 0) {
      for (const st of data.subtasks) {
        const assignee = st.assigneeName ? chalk.cyan(st.assigneeName) : chalk.gray('unassigned');
        console.log(`    - ${st.title} → ${assignee}`);
      }
      console.log('');
    }
  }
}

// ── Task status ───────────────────────────────────────────────────

async function doTaskStatus(port: number): Promise<void> {
  const projectId = await getProjectId(port);

  const result = (await api(port, 'GET', `/projects/${projectId}/tasks/status`)) as {
    data: { id: string; title: string; status: string; assignee?: string; result?: string; error?: string }[];
    stats: { total: number; done: number; failed: number; inProgress: number; pending: number };
  };

  const { data: tasks, stats } = result;

  if (tasks.length === 0) {
    console.log(chalk.yellow('No tasks found.'));
    return;
  }

  const statusIcon = (s: string) => {
    switch (s) {
      case 'DONE': return chalk.green('✓');
      case 'FAILED': return chalk.red('✗');
      case 'IN_PROGRESS': return chalk.yellow('⟳');
      case 'CREATED': return chalk.gray('○');
      default: return chalk.blue('…');
    }
  };

  console.log(chalk.bold(`\n  Progress: ${stats.done}/${stats.total} done, ${stats.failed} failed, ${stats.inProgress} in progress\n`));

  for (const t of tasks) {
    const assignee = t.assignee ? chalk.cyan(` [${t.assignee}]`) : '';
    console.log(`  ${statusIcon(t.status)} ${t.title}${assignee} ${chalk.dim(t.status)}`);
    if (t.error) {
      console.log(chalk.red(`      Error: ${t.error}`));
    }
    if (t.result && t.status === 'DONE') {
      const preview = t.result.length > 100 ? t.result.slice(0, 100) + '...' : t.result;
      console.log(chalk.dim(`      ${preview}`));
    }
  }
}

// ── Menu ──────────────────────────────────────────────────────────

const MENU_CHOICES = [
  new Separator(chalk.dim('── Work ──')),
  { name: '💬 Chat with PM',    value: 'chat' },
  { name: '📊 Task status',     value: 'task:status' },
  new Separator(chalk.dim('── Project ──')),
  { name: 'List projects',      value: 'project:list' },
  { name: 'Create project',     value: 'project:create' },
  new Separator(chalk.dim('── Agent ──')),
  { name: 'Add agent',          value: 'agent:add' },
  { name: 'List agents',        value: 'agent:list' },
  { name: 'Show agent',         value: 'agent:show' },
  { name: 'Update agent',       value: 'agent:update' },
  { name: 'Remove agent',       value: 'agent:remove' },
  new Separator(chalk.dim('── Skill ──')),
  { name: 'Init .madev',        value: 'skill:init' },
  { name: 'List skills',        value: 'skill:list' },
  { name: 'Add skill',          value: 'skill:add' },
  { name: 'Show skill',         value: 'skill:show' },
  { name: 'Validate skills',    value: 'skill:validate' },
  { name: 'Remove skill',       value: 'skill:remove' },
  new Separator(chalk.dim('────────────')),
  { name: 'Exit',               value: 'exit' },
];

export async function interactiveMenu(port: number): Promise<void> {
  console.log(chalk.cyan('  Interactive mode ready. Select an action below.\n'));

  while (true) {
    let action: string;
    try {
      action = await select({
        message: 'What would you like to do?',
        choices: MENU_CHOICES,
      });
    } catch {
      break;
    }

    if (action === 'exit') {
      break;
    }

    try {
      switch (action) {
        case 'chat':           await doChat(port); break;
        case 'task:status':    await doTaskStatus(port); break;
        case 'project:list':   await doProjectList(port); break;
        case 'project:create': await doProjectCreate(port); break;
        case 'agent:add':      await doAgentAdd(port); break;
        case 'agent:list':     await doAgentList(port); break;
        case 'agent:show':     await doAgentShow(port); break;
        case 'agent:update':   await doAgentUpdate(port); break;
        case 'agent:remove':   await doAgentRemove(port); break;
        case 'skill:init':     await doSkillInit(); break;
        case 'skill:list':     await doSkillList(); break;
        case 'skill:add':      await doSkillAdd(); break;
        case 'skill:show':     await doSkillShow(); break;
        case 'skill:validate': await doSkillValidate(); break;
        case 'skill:remove':   await doSkillRemove(); break;
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
    }

    console.log('');
  }
}
