import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runCliCommand(args) {
  return new Promise((resolve) => {
    const cli = spawn('node', [
      '--no-warnings',
      path.resolve(__dirname, '../bin/simplepage.js'),
      ...args
    ]);

    let stdout = '';
    let stderr = '';

    cli.stdout.on('data', (data) => { stdout += data.toString(); });
    cli.stderr.on('data', (data) => { stderr += data.toString(); });

    cli.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
  });
} 