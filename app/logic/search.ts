import type { WorldIndex } from './index';

export interface SearchResult {
  kind: 'node' | 'customer';
  id: string;
  name: string;
  subtitle: string;
}

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function score(name: string, id: string, q: string): number {
  const n = normalize(name);
  if (n.startsWith(q)) return 0;
  if (n.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(q))) return 1;
  if (n.includes(q) || id.includes(q)) return 2;
  return -1;
}

export function search(idx: WorldIndex, query: string, limit = 8): SearchResult[] {
  const q = normalize(query.trim());
  if (!q) return [];
  const districtName = new Map(idx.world.districts.map((d) => [d.id, d.name] as const));
  const sectorName = new Map(idx.world.sectors.map((s) => [s.id, s.name] as const));
  const scored: (SearchResult & { score: number })[] = [];
  for (const n of idx.world.nodes) {
    const s = score(n.name, n.id, q);
    if (s >= 0) scored.push({ kind: 'node', id: n.id, name: n.name, subtitle: districtName.get(n.district) ?? n.district, score: s });
  }
  for (const c of idx.world.customers) {
    const s = score(c.name, c.id, q);
    if (s >= 0) scored.push({ kind: 'customer', id: c.id, name: c.name, subtitle: sectorName.get(c.harbor) ?? c.harbor, score: s });
  }
  scored.sort((a, b) => a.score - b.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return scored.slice(0, limit).map(({ score: _s, ...r }) => r);
}
