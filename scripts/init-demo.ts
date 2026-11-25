import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const port = process.argv[2] ?? '8000';
if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error('Usage: npm run init:demo -- [port]');
}
const template = await readFile('.env.example', 'utf8');
const config = template
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`)
  .replace(/^DJANGO_SECRET_KEY=$/m, `DJANGO_SECRET_KEY=${randomBytes(32).toString('hex')}`)
  .replace(/^FLAGSMITH_ADMIN_PASSWORD=$/m, `FLAGSMITH_ADMIN_PASSWORD=Aa1_${randomBytes(24).toString('hex')}`)
  .replace(/^FLAGSMITH_PORT=8000$/m, `FLAGSMITH_PORT=${port}`)
  .replace('http://localhost:8000/api/v1/', `http://localhost:${port}/api/v1/`);

try {
  await writeFile('.env', config, { flag: 'wx', mode: 0o600 });
  console.log(`Created .env for localhost:${port}. Keep it with this demo stack.`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  console.error('.env already exists. Reuse it or initialize the demo in a fresh directory.');
  process.exitCode = 1;
}
