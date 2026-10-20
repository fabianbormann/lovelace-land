import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { formatPath, type LoadedData } from './load';
import { IsoDateSchema, SlugSchema, YearMonthSchema } from './schema';

/** month (YYYY-MM) → count; months without activity may be missing */
export type MonthCounts = Record<string, number>;

export interface Activity {
  tx: Map<string, MonthCounts>;
  commits: Map<string, MonthCounts>;
}

const months = z.record(YearMonthSchema, z.number().int().nonnegative());
const TxFileSchema = z.object({ id: SlugSchema, source: z.string().min(1), query: z.string().optional(), collected: IsoDateSchema, months }).strict();
const CommitsFileSchema = z.object({ id: SlugSchema, repo: z.string().min(1), collected: IsoDateSchema, months }).strict();

export const emptyActivity = (): Activity => ({ tx: new Map(), commits: new Map() });

/** Reads data/activity/{tx,commits}/<id>.json (written by scripts/collect-activity.ts). */
export function loadActivity(dataDir: string): { activity: Activity; errors: string[] } {
  const activity = emptyActivity();
  const errors: string[] = [];
  const kinds = [
    ['tx', TxFileSchema, activity.tx],
    ['commits', CommitsFileSchema, activity.commits],
  ] as const;
  for (const [kind, schema, into] of kinds) {
    const dir = join(dataDir, 'activity', kind);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.') || !name.endsWith('.json')) continue;
      const rel = `activity/${kind}/${name}`;
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      } catch (e) {
        errors.push(`${rel}: invalid JSON (${(e as Error).message.split('\n')[0]})`);
        continue;
      }
      const parsed = (schema as z.ZodTypeAny).safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) errors.push(`${rel}: ${formatPath(issue.path)} ${issue.message}`);
        continue;
      }
      const expected = name.slice(0, -'.json'.length);
      if (parsed.data.id !== expected) {
        errors.push(`${rel}: id "${parsed.data.id}" must match the filename "${expected}"`);
        continue;
      }
      into.set(expected, parsed.data.months as MonthCounts);
    }
  }
  return { activity, errors };
}

export function validateActivity(activity: Activity, data: LoadedData): string[] {
  const known = new Set([...data.nodes.map((n) => n.id), ...data.customers.map((c) => c.id)]);
  const errors: string[] = [];
  for (const [kind, map] of [['tx', activity.tx], ['commits', activity.commits]] as const)
    for (const id of map.keys()) if (!known.has(id)) errors.push(`activity/${kind}/${id}.json: "${id}" is not a building or ship on the island`);
  return errors;
}
