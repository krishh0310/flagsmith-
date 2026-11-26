#!/bin/sh
set -eu

node -e 'if (+process.versions.node.split(".")[0] < 24) { console.error("Flag Rehearsal requires Node.js 24 or newer."); process.exit(1); }'
if ! docker info >/dev/null 2>&1; then
  echo 'Start Docker Engine or Docker Desktop, then rerun npm run demo.' >&2
  exit 1
fi
compose_version=$(docker compose version --short)
node -e 'const [major, minor] = process.argv[1].replace(/^v/, "").split(".").map(Number); if (!(major > 2 || (major === 2 && minor >= 20))) { console.error("Install Docker Compose 2.20 or newer."); process.exit(1); }' "$compose_version"
node --input-type=module -e '
import { createServer } from "node:net";
const port = Number(process.env.REHEARSAL_DASHBOARD_PORT ?? 4175);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Invalid dashboard port.");
const server = createServer();
server.on("error", () => { console.error("Dashboard port " + port + " is busy. Stop its listener or set REHEARSAL_DASHBOARD_PORT."); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => server.close());
'
npm ci
npx playwright install --only-shell chromium
if test -f .env && node --env-file=.env -e 'process.exit(process.env.FLAGSMITH_CURRENT_ENVIRONMENT_KEY && process.env.FLAGSMITH_PROPOSED_ENVIRONMENT_KEY ? 0 : 1)'; then
  docker compose up -d --wait --wait-timeout 240
  npm run setup:flagsmith
else
  npm run setup:demo
fi
exec npm run dashboard
