import { Command } from 'commander';
import chalk from 'chalk';
import { startCommand } from './commands/start.js';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { stopCommand } from './commands/stop.js';
import {
  agentAddCommand,
  agentListCommand,
  agentShowCommand,
  agentUpdateCommand,
  agentRemoveCommand,
} from './commands/agent.js';
import {
  doSkillInit,
  doSkillList,
  doSkillAdd,
  doSkillShow,
  doSkillRemove,
  doSkillValidate,
} from './commands/skill.js';

const program = new Command();

program
  .name('mct-madev')
  .description(chalk.bold('MCT-MADEV: Multi-Agent Orchestration CLI'))
  .version('0.1.0');

program
  .command('start')
  .description('Start the MCT-MADEV server and open the dashboard')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('--no-open', 'Do not open browser automatically')
  .action(startCommand);

program
  .command('init')
  .description('Create a default mct-madev.yml config in the current directory')
  .option('-f, --force', 'Overwrite existing config file')
  .action(initCommand);

program
  .command('status')
  .description('Check the status of a running MCT-MADEV server')
  .option('-p, --port <port>', 'Port to check', '3000')
  .action(statusCommand);

program
  .command('stop')
  .description('Stop a running MCT-MADEV server')
  .option('-p, --port <port>', 'Port of the server to stop', '3000')
  .action(stopCommand);

const agent = program.command('agent').description('Manage agents');

agent
  .command('add')
  .description('Add a new agent interactively')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(agentAddCommand);

agent
  .command('list')
  .description('List agents in a project')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(agentListCommand);

agent
  .command('show <id>')
  .description('Show agent details')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(agentShowCommand);

agent
  .command('update <id>')
  .description('Update an agent interactively')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(agentUpdateCommand);

agent
  .command('remove <id>')
  .description('Remove an agent')
  .option('-p, --port <port>', 'Server port', '3000')
  .action(agentRemoveCommand);

const skill = program.command('skill').description('Manage .madev skills');

skill
  .command('init')
  .description('Initialize .madev directory with skills and guidelines')
  .action(doSkillInit);

skill
  .command('list')
  .description('List available skills')
  .action(doSkillList);

skill
  .command('add')
  .description('Add a new skill interactively')
  .action(doSkillAdd);

skill
  .command('show')
  .description('Show skill details')
  .action(doSkillShow);

skill
  .command('validate')
  .description('Validate all skill definitions')
  .action(doSkillValidate);

skill
  .command('remove')
  .description('Remove a skill')
  .action(doSkillRemove);

program.parse();
