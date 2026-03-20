import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

const SAMPLE_CONFIG = `# MCT-MADEV Workflow Configuration
# Docs: https://github.com/mct-madev/docs

name: my-workflow
version: "1.0"

agents:
  - id: planner
    role: planner
    model: gpt-4
    description: Breaks down tasks into subtasks

  - id: executor
    role: executor
    model: gpt-4
    description: Executes subtasks from the planner

  - id: reviewer
    role: reviewer
    model: gpt-4
    description: Reviews executor output for quality

workflow:
  entry: planner
  steps:
    - from: planner
      to: executor
    - from: executor
      to: reviewer
    - from: reviewer
      to: planner
      condition: needs_revision

settings:
  max_iterations: 10
  timeout: 300
  verbose: true
`;

const CONFIG_FILENAME = 'mct-madev.yml';

interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions) {
  const configPath = join(process.cwd(), CONFIG_FILENAME);

  if (existsSync(configPath) && !options.force) {
    console.error(
      chalk.red(`${CONFIG_FILENAME} already exists. Use ${chalk.bold('--force')} to overwrite.`)
    );
    process.exit(1);
  }

  try {
    writeFileSync(configPath, SAMPLE_CONFIG, 'utf-8');
    console.log(chalk.green(`Created ${chalk.bold(CONFIG_FILENAME)} in ${process.cwd()}`));
  } catch (err) {
    console.error(chalk.red('Failed to create config file:'), err);
    process.exit(1);
  }
}
