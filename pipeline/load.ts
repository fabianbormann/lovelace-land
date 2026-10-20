import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  CustomerSchema,
  DistrictsFileSchema,
  NodeSchema,
  SectorsFileSchema,
  type Customer,
  type District,
  type Node,
  type Sector,
} from './schema';

export interface LoadedData {
  districts: District[];
  sectors: Sector[];
  nodes: Node[];
  customers: Customer[];
}

export const nodeFile = (id: string) => `nodes/${id}.yaml`;
export const customerFile = (id: string) => `customers/${id}.yaml`;

export function formatPath(path: (string | number)[]): string {
  return path.map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`)).join('');
}

function readYaml(dir: string, rel: string, errors: string[]): unknown {
  let text: string;
  try {
    text = readFileSync(join(dir, rel), 'utf8');
  } catch {
    errors.push(`${rel}: file not found`);
    return undefined;
  }
  try {
    return parse(text);
  } catch (e) {
    errors.push(`${rel}: invalid YAML: ${(e as Error).message.split('\n')[0]}`);
    return undefined;
  }
}

function check<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, rel: string, errors: string[]): T | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const where = formatPath(issue.path);
    errors.push(where ? `${rel}: ${where} ${issue.message}` : `${rel}: ${issue.message}`);
  }
  return undefined;
}

function listEntryFiles(dir: string, sub: string, errors: string[]): string[] {
  const full = join(dir, sub);
  if (!existsSync(full)) return [];
  const files: string[] = [];
  const entries = readdirSync(full, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.')) continue;
    if (entry.isDirectory()) errors.push(`${sub}/${name}: subfolders are not read; move its files directly into ${sub}/`);
    else if (name.endsWith('.yml')) errors.push(`${sub}/${name}: use the .yaml extension`);
    else if (!name.endsWith('.yaml')) errors.push(`${sub}/${name}: only lowercase .yaml files belong here; rename or move it`);
    else files.push(`${sub}/${name}`);
  }
  return files;
}

const DATA_ROOT_ENTRIES = new Set(['districts.yaml', 'sectors.yaml', 'nodes', 'customers', 'activity', 'layout.lock.json', 'LICENSE', 'README.md']);

function checkDataRoot(dir: string, errors: string[]) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || DATA_ROOT_ENTRIES.has(name)) continue;
    errors.push(`${name}: unexpected entry in the data folder (expected districts.yaml, sectors.yaml, nodes/, customers/, layout.lock.json)`);
  }
}

function loadEntries<T extends { id: string }>(
  dir: string,
  sub: 'nodes' | 'customers',
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  errors: string[],
): T[] {
  const entries: T[] = [];
  for (const rel of listEntryFiles(dir, sub, errors)) {
    const raw = readYaml(dir, rel, errors);
    if (raw === undefined) continue;
    const entry = check(schema, raw, rel, errors);
    if (!entry) continue;
    const expected = rel.slice(sub.length + 1, -'.yaml'.length);
    if (entry.id !== expected) {
      errors.push(`${rel}: id "${entry.id}" must match the filename "${expected}"`);
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

export function loadDataDir(dir: string): { data: LoadedData; errors: string[] } {
  const errors: string[] = [];
  const districtsRaw = readYaml(dir, 'districts.yaml', errors);
  const districts =
    districtsRaw === undefined ? [] : (check(DistrictsFileSchema, districtsRaw, 'districts.yaml', errors) ?? []);
  const sectorsRaw = readYaml(dir, 'sectors.yaml', errors);
  const sectors = sectorsRaw === undefined ? [] : (check(SectorsFileSchema, sectorsRaw, 'sectors.yaml', errors) ?? []);
  const nodes = loadEntries(dir, 'nodes', NodeSchema, errors);
  const customers = loadEntries(dir, 'customers', CustomerSchema, errors);
  checkDataRoot(dir, errors);
  return { data: { districts, sectors, nodes, customers }, errors };
}
