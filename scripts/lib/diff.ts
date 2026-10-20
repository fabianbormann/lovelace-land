import type { World } from '../../pipeline/emit';

const TIERS = ['hut', 'house', 'hall', 'keep'];
/** Names come from contributors; keep them from pinging people or embedding images in the comment. */
const esc = (t: string) => t.replace(/@/g, '@\u200b').replace(/!\[/g, '!\u200b[');
const plural = (n: number, word: string) => `${n > 0 ? '+' : '−'}${Math.abs(n)} ${word}${Math.abs(n) === 1 ? '' : 's'}`;

/** A pull-request comment describing how a data change reshapes the island. */
export function diffWorlds(before: World, after: World): string {
  const lines: string[] = [];
  const set = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x] as const));
  const section = <T extends { id: string; name?: string }>(word: string, a: T[], b: T[], label = (x: T) => esc(x.name ?? x.id)) => {
    const A = set(a);
    const B = set(b);
    const added = b.filter((x) => !A.has(x.id));
    const removed = a.filter((x) => !B.has(x.id));
    if (added.length) lines.push(`- **${plural(added.length, word)}**: ${added.map(label).join(', ')}`);
    if (removed.length) lines.push(`- **${plural(-removed.length, word)}**: ${removed.map(label).join(', ')}`);
  };
  section('building', before.nodes, after.nodes);
  section('ship', before.customers, after.customers);
  section('road', before.edges, after.edges, (e) => e.id.replace('->', ' → '));

  const old = new Map(before.nodes.map((n) => [n.id, n] as const));
  for (const n of after.nodes) {
    const o = old.get(n.id);
    if (o && o.tier !== n.tier) lines.push(`- ${esc(n.name)} ${n.tier > o.tier ? 'grows' : 'shrinks'} from ${TIERS[o.tier - 1]} to ${TIERS[n.tier - 1]}`);
  }
  const strandedNow = after.nodes.filter((n) => n.stranded && !old.get(n.id)?.stranded).map((n) => esc(n.name)).sort();
  if (strandedNow.length) lines.push(`- Newly stranded: ${strandedNow.join(', ')}`);
  const rescued = after.nodes.filter((n) => !n.stranded && old.get(n.id)?.stranded).map((n) => n.name);
  if (rescued.length) lines.push(`- Now connected to a customer: ${rescued.join(', ')}`);
  const hh = (w: World) => new Set(w.nodes.filter((n) => n.hiddenHighway).map((n) => n.name));
  const newHH = [...hh(after)].filter((n) => !hh(before).has(n));
  if (newHH.length) lines.push(`- New hidden highways: ${newHH.join(', ')}`);
  return lines.length ? lines.join('\n') : 'No change to the island.';
}
