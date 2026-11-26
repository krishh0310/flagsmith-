import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import serveStatic from '@fastify/static';

const revision = 'ff43b02e59dfa604386bb382034b2cd07c2bcd8a';
const checkout = process.argv[2];
if (!checkout || execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision ||
    execFileSync('git', ['-C', checkout, 'status', '--porcelain', '--', 'license.md', 'examples/javascript-es5/dist'],
      { encoding: 'utf8' }).trim()) {
  throw Error('Pass a clean TodoMVC checkout at ' + revision);
}
const servers: ReturnType<typeof Fastify>[] = [];
for (const port of [4191, 4192]) {
  const server = Fastify();
  await server.register(serveStatic, { root: resolve(checkout, 'examples/javascript-es5/dist') });
  servers.push(server);
  await server.listen({ port, host: '127.0.0.1' });
  console.log('TodoMVC at http://127.0.0.1:' + port);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void Promise.all(servers.map(server => server.close())));
}
