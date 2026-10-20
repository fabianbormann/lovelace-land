import type { World } from '../../pipeline/emit';
import type { AnnouncedWindow } from '../../pipeline/timeline';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatMonth = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

function lastBefore(series: number[], months: string[], i: number): string | null {
  for (let k = i; k >= 0; k--) if (series[k] > 0) return months[k];
  return null;
}

/** One sentence on why a building looks the way it does in month i. */
export function describeNodeAt(world: World, id: string, i: number): string {
  const tl = world.timeline;
  const n = tl.nodes[id];
  const month = formatMonth(tl.months[i]);
  if (n.noData) return 'No activity data, so it is shown standing throughout.';
  const lastCommit = lastBefore(n.commits, tl.months, i) ?? (n.lastCommit && n.lastCommit < tl.months[0] ? n.lastCommit : null);
  const active = n.traffic.map((t, k) => t + n.tx[k] + n.commits[k]);
  const lastSign = lastBefore(active, tl.months, i) ?? lastCommit;
  const since = lastSign ? ` since ${formatMonth(lastSign)}` : '';
  switch (n.state[i]) {
    case 'e':
      return `Not founded yet in ${month}.`;
    case 'c':
      return `Founded in ${month}: under construction.`;
    case 'b':
      return `No commits or traffic${since}, so it is burning.`;
    case 'u':
      return `No commits or traffic${since}, so it has fallen into ruin.`;
    case 'g':
      return `No commits or traffic${since}, so it has returned to grass.`;
    case 'r':
      return `Still used in ${month}, but its public repository has had no commits${lastCommit ? ` since ${formatMonth(lastCommit)}` : ''}.`;
    default:
      return `Active in ${month}.`;
  }
}

/** One sentence on where a ship is in month i and what that is based on. */
export function describeShipAt(world: World, id: string, i: number): string {
  const tl = world.timeline;
  const c = tl.customers[id];
  const month = formatMonth(tl.months[i]);
  const state = c.state[i];
  const a = c.announced;
  const last = lastBefore(c.tx, tl.months, i);
  if (state === 'w') {
    if (a?.ended) return `A wreck: its announced use ended in ${formatMonth(a.until)}.`;
    return last
      ? `A wreck: it stopped using the product after ${formatMonth(last)}.`
      : 'A wreck: it is recorded as no longer using the product, and there is no activity data to date when it stopped.';
  }
  const tx = c.tx[i].toLocaleString('en');
  if (state === 'a') {
    const since = last ? `since ${formatMonth(last)}` : 'yet';
    if (c.source === 'onchain') return `Away in ${month}: no on-chain transactions ${since}.`;
    if (c.source === 'products') return `Away in ${month}: no transactions through the products it uses ${since}.`;
    if (c.source === 'product-activity') return `Away in ${month}: the products it uses have had no activity ${since}.`;
    if (c.source !== 'announced') return `Away in ${month}: no activity ${since}.`;
    if (a && tl.months[i] > a.until)
      return a.ended
        ? `Away in ${month}: its announced period of use ended in ${formatMonth(a.until)}.`
        : `Away in ${month}: its announced use was last confirmed in ${formatMonth(a.confirmed)}, and nothing newer is on record.`;
    return `Away in ${month}: outside its announced period of activity.`;
  }
  switch (c.source) {
    case 'onchain':
      return `Docked in ${month} with ${tx} on-chain transactions.`;
    case 'products':
      return `Docked in ${month} with ${tx} transactions through the products it uses.`;
    case 'announced':
      return a
        ? `Docked in ${month}, based on announced use last confirmed in ${formatMonth(a.confirmed)} (no on-chain data).`
        : `Docked in ${month}, based on announced activity (no on-chain data).`;
    case 'product-activity':
      return `Docked in ${month} while the products it uses are active.`;
    default:
      return `Docked in ${month}; there is no activity data, so it is assumed active.`;
  }
}

/** The announced window of a ship without on-chain data, shown instead of a transaction chart. */
export function describeAnnouncedPeriod(a: AnnouncedWindow | undefined): string {
  if (!a) return 'No on-chain data.';
  const from = formatMonth(a.from);
  if (a.ended) return `No on-chain data. Use announced from ${from} until ${formatMonth(a.until)}.`;
  const confirmed = a.confirmed === a.from ? ' and not confirmed since' : `, last confirmed ${formatMonth(a.confirmed)}`;
  return `No on-chain data. Use announced from ${from}${confirmed}, so it counts until ${formatMonth(a.until)}.`;
}
