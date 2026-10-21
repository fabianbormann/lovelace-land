/**
 * Looks up each project's brand color on its own website (the theme-color it declares for browsers,
 * or its web app manifest) and proposes it as `brand` for the project's roofs.
 *   npx tsx scripts/fetch-brand-colors.ts            # print what was found
 *   npx tsx scripts/fetch-brand-colors.ts --write    # also add it to data/nodes/*.yaml
 * Projects that already have a brand color are left alone, so a color set by hand is never overwritten.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDataDir, nodeFile } from '../pipeline/load';
import { manifestUrlFrom, themeColorFrom, themeColorFromManifest, usableBrandColor } from './lib/brand-colors';

const { values } = parseArgs({ options: { data: { type: 'string', default: 'data' }, write: { type: 'boolean', default: false } } });
const dataDir = values.data!;
const { data } = loadDataDir(dataDir);

const get = async (url: string) => {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (lovelace.land brand colors)' }, signal: AbortSignal.timeout(15_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { text: await res.text(), url: res.url || url };
};

async function brandOf(site: string): Promise<{ color: string; source: string } | { skipped: string }> {
  const page = await get(site);
  const meta = themeColorFrom(page.text);
  if (meta) return usableBrandColor(meta) ? { color: meta, source: site } : { skipped: `theme-color ${meta} is too pale, dark or grey` };
  const manifest = manifestUrlFrom(page.text, page.url);
  if (!manifest) return { skipped: 'no theme-color or manifest' };
  const color = themeColorFromManifest(JSON.parse((await get(manifest)).text));
  if (!color) return { skipped: 'manifest without theme_color' };
  return usableBrandColor(color) ? { color, source: manifest } : { skipped: `manifest theme_color ${color} is too pale, dark or grey` };
}

const found: { id: string; color: string; source: string }[] = [];
const queue = data.nodes.filter((n) => n.links.website && !n.brand);
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let n = queue.shift(); n; n = queue.shift()) {
      try {
        const r = await brandOf(n.links.website!);
        if ('color' in r) found.push({ id: n.id, ...r });
        else console.log(`skip  ${n.id.padEnd(30)} ${r.skipped}`);
      } catch (e) {
        console.log(`skip  ${n.id.padEnd(30)} ${(e as Error).message}`);
      }
    }
  }),
);
found.sort((a, b) => a.id.localeCompare(b.id));
for (const f of found) console.log(`found ${f.id.padEnd(30)} ${f.color}  ${f.source}`);
console.log(`\n${found.length} brand colors found.`);

// Appended as text rather than re-serialised, so the rest of the file keeps its formatting.
if (values.write)
  for (const f of found) {
    const path = join(dataDir, nodeFile(f.id));
    const text = readFileSync(path, 'utf8');
    if (/^brand:/m.test(text)) continue;
    writeFileSync(path, `${text.replace(/\n*$/, '\n')}brand:\n  color: "${f.color}"\n  source: ${f.source}\n`);
  }
