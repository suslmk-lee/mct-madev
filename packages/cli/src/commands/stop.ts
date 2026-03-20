import chalk from 'chalk';

interface StopOptions {
  port: string;
}

export async function stopCommand(options: StopOptions) {
  const port = parseInt(options.port, 10);
  const url = `http://localhost:${port}/api/shutdown`;

  console.log(chalk.blue(`Sending shutdown signal to port ${port}...`));

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      console.log(chalk.green('Server shutdown initiated.'));
    } else {
      console.log(chalk.yellow(`Server responded with status ${res.status}.`));
    }
  } catch {
    console.log(chalk.red('Could not reach the server. Is it running?'));
    process.exit(1);
  }
}
