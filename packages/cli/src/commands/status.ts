import chalk from 'chalk';

interface StatusOptions {
  port: string;
}

export async function statusCommand(options: StatusOptions) {
  const port = parseInt(options.port, 10);
  const url = `http://localhost:${port}/api/health`;

  console.log(chalk.blue(`Checking server at port ${port}...`));

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    console.log(chalk.green.bold('Server is running'));
    console.log(chalk.white(`  Status:  ${data.status ?? 'ok'}`));
    console.log(chalk.white(`  Uptime:  ${data.uptime ?? 'unknown'}`));
    console.log(chalk.white(`  Version: ${data.version ?? 'unknown'}`));
  } catch {
    console.log(chalk.red.bold('Server is not running'));
    console.log(chalk.gray(`  Could not reach ${url}`));
    process.exit(1);
  }
}
