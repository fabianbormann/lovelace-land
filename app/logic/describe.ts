import type { World } from '../../pipeline/emit';

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
  if (state === 'w') return 'A wreck: this customer stopped using the product.';
  const tx = c.tx[i].toLocaleString('en');
  if (state === 'a')
    return c.source === 'announced' ? `Away in ${month}: outside its announced period of activity.` : `Away in ${month}: no transactions that month.`;
  switch (c.source) {
    case 'onchain':
      return `Docked in ${month} with ${tx} on-chain transactions.`;
    case 'products':
      return `Docked in ${month} with ${tx} transactions through the products it uses.`;
    case 'announced':
      return `Docked in ${month}, based on announced activity (no on-chain data).`;
    case 'product-activity':
      return `Docked in ${month} while the products it uses are active.`;
    default:
      return `Docked in ${month}; there is no activity data, so it is assumed active.`;
  }
}
