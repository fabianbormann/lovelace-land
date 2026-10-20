import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { serializeWorld } from './emit';
import { runPipeline } from './run';

const { values } = parseArgs({
  options: {
    data: { type: 'string', default: 'data' },
    out: { type: 'string', default: 'public/world.json' },
    check: { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
  },
});
const dataDir = values.data!;
const outFile = values.out!;
const lockPath = join(dataDir, 'layout.lock.json');

const lockText = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : null;
const result = runPipeline(dataDir, lockText, new Date().toISOString());

for (const w of result.warnings) console.warn(`warning  ${w}`);
if (result.errors.length > 0 || !result.world) {
  for (const e of result.errors) console.error(`error    ${e}`);
  console.error(`\n${result.errors.length} error(s) — nothing was written.`);
  process.exit(1);
}

const world = result.world;
// Contributors editing one YAML file can't always rebuild the lock, so a stale lock only warns;
// main regenerates and commits it. --strict (used on main) makes it an error.
const lockStale = lockText !== result.lockText && (lockText !== null || world.nodes.length > 0);
if (values.check && lockStale) {
  const message = 'layout.lock.json is out of date; run npm run build:world and commit the updated lock file.';
  console.error(`${values.strict ? 'error  ' : 'warning'}  ${message}`);
  if (values.strict) process.exit(1);
}
if (!values.check) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, serializeWorld(world));
  writeFileSync(lockPath, result.lockText!);
}
const stranded = world.nodes.filter((n) => n.stranded).length;
const highways = world.nodes.filter((n) => n.hiddenHighway).length;
console.log(
  `${world.nodes.length} buildings, ${world.customers.length} ships, ${world.edges.length} roads · ${stranded} stranded · ${highways} hidden highways` +
    (values.check ? ' (check only, nothing written)' : ''),
);
