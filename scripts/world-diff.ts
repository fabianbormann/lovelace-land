/** Prints a Markdown summary of how the island changes between two world.json files. */
import { existsSync, readFileSync } from 'node:fs';
import type { World } from '../pipeline/emit';
import { diffWorlds } from './lib/diff';

const [beforePath, afterPath] = process.argv.slice(2);
const read = (p: string): World =>
  existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { nodes: [], customers: [], edges: [] } as unknown as World;
console.log('### How this changes Lovelace Land\n');
console.log(diffWorlds(read(beforePath), read(afterPath)));
