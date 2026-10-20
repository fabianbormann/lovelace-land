import type { WorldEdge } from '../../pipeline/emit';
import type { Target } from '../logic/hash';
import { nodeUpstream, type WorldIndex } from '../logic/index';
import { describeNodeAt, describeShipAt, formatMonth } from '../logic/describe';
import { tierName } from '../scene/town';
import { sparkline } from './sparkline';
import { extLink, fmt, h, hostOf } from './dom';

export interface PanelActions {
  select(target: Target): void;
  follow(customerId: string): void;
  close(): void;
}

const STAGE_LABEL = { production: 'In production', pilot: 'Pilot', announced: 'Announced', ended: 'Ended' } as const;
const SHIP_LABEL = { production: 'Galleon', pilot: 'Rowboat', announced: 'Ghost ship', ended: 'Wreck' } as const;
const STATUS_LABEL = { active: 'Active', maintenance: 'Maintenance only', deprecated: 'Deprecated' } as const;
const RELATION_LABEL = { library: 'library', service: 'service', language: 'written in', infrastructure: 'runs on' } as const;

function evidenceList(edge: WorldEdge) {
  return h(
    'ul',
    { class: 'evidence' },
    ...edge.evidence.map((ev) =>
      h('li', {}, extLink(ev.url, hostOf(ev.url)), ` · ${ev.kind}`, ev.note ? ` · “${ev.note}”` : '', h('span', { class: 'rel-meta' }, ` · retrieved ${ev.retrieved}`)),
    ),
  );
}

function relationItem(idx: WorldIndex, edge: WorldEdge, otherId: string, actions: PanelActions) {
  const other = idx.node.get(otherId) ?? idx.customer.get(otherId);
  const name = other?.name ?? otherId;
  const kind = idx.node.has(otherId) ? 'node' : 'customer';
  return h(
    'li',
    {},
    h(
      'div',
      { class: 'rel-head' },
      h('button', { type: 'button', onclick: undefined }, name),
      h('span', { class: 'rel-meta' }, edge.relation ? `${RELATION_LABEL[edge.relation]} · ` : '', h('span', { class: `conf ${edge.confidence}` }, edge.confidence)),
    ),
    evidenceList(edge),
  );
}

function wireRelations(list: HTMLElement, items: { otherId: string; kind: 'node' | 'customer' }[], actions: PanelActions) {
  list.querySelectorAll<HTMLButtonElement>('.rel-head button').forEach((btn, i) =>
    btn.addEventListener('click', () => actions.select({ kind: items[i].kind, id: items[i].otherId })),
  );
}

function relationSection(title: string, idx: WorldIndex, edges: WorldEdge[], side: 'to' | 'from', actions: PanelActions, empty: string) {
  const items = edges.map((e) => ({ edge: e, otherId: e[side], kind: (idx.node.has(e[side]) ? 'node' : 'customer') as 'node' | 'customer' }));
  const list = h('ul', { class: 'rel-list' }, ...items.map((it) => relationItem(idx, it.edge, it.otherId, actions)));
  wireRelations(list, items, actions);
  return [h('h3', {}, `${title} (${edges.length})`), edges.length ? list : h('p', { class: 'eyebrow' }, empty)];
}

function history(series: number[], i: number, what: string, meta: (string | null)[], sentence: string, state: string) {
  const total = series.reduce((a, b) => a + b, 0);
  return h(
    'div',
    { class: 'history' },
    h('h3', {}, `History · ${what}`),
    total > 0 ? sparkline(series, i, `${what} per month`) : h('p', { class: 'eyebrow' }, `No ${what} recorded.`),
    h('div', { class: 'history-meta' }, ...meta.filter((m): m is string => !!m).map((m) => h('span', {}, m))),
    h('p', { class: 'state-line', 'data-state': state }, sentence),
  );
}

const lastUpTo = (series: number[], months: string[], i: number) => {
  for (let k = i; k >= 0; k--) if (series[k] > 0) return months[k];
  return null;
};

function sizeAt(idx: WorldIndex, id: string, i: number) {
  const tier = Number(idx.world.timeline.nodes[id].tier[i]);
  return tier ? tierName(tier) : '—';
}

function nodeHistory(idx: WorldIndex, id: string, i: number) {
  const tl = idx.world.timeline;
  const t = tl.nodes[id];
  const hasTx = t.tx.some((v) => v > 0);
  const lastCommit = lastUpTo(t.commits, tl.months, i) ?? (t.lastCommit && t.lastCommit < tl.months[0] ? t.lastCommit : null);
  const lastUse = lastUpTo(t.traffic.map((v, k) => v + t.tx[k]), tl.months, i);
  return history(
    hasTx ? t.tx : t.commits,
    i,
    hasTx ? 'on-chain transactions' : 'commits',
    [lastCommit && `Last commit ${formatMonth(lastCommit)}`, lastUse && `Last used ${formatMonth(lastUse)}`],
    describeNodeAt(idx.world, id, i),
    t.state[i],
  );
}

function customerHistory(idx: WorldIndex, id: string, i: number) {
  const tl = idx.world.timeline;
  return history(tl.customers[id].tx, i, 'transactions', [], describeShipAt(idx.world, id, i), tl.customers[id].state[i]);
}

/** Refresh only the month-dependent parts, so playback keeps focus and scroll position in the panel. */
export function updatePanelTime(root: HTMLElement, idx: WorldIndex, target: Target, time: number) {
  const tl = idx.world.timeline;
  const i = Math.min(Math.max(Math.floor(time), 0), tl.months.length - 1);
  const old = root.querySelector('.history');
  if (target.kind === 'node' && idx.node.has(target.id)) {
    old?.replaceWith(nodeHistory(idx, target.id, i));
    const traffic = root.querySelector('[data-role="traffic"]');
    traffic?.replaceChildren(h('b', {}, fmt(tl.nodes[target.id].traffic[i])), h('span', {}, `traffic in ${formatMonth(tl.months[i])}`));
    root.querySelector('[data-role="size"] b')?.replaceChildren(sizeAt(idx, target.id, i));
  } else if (target.kind === 'customer' && idx.customer.has(target.id)) {
    old?.replaceWith(customerHistory(idx, target.id, i));
  }
}

export function renderPanel(root: HTMLElement, idx: WorldIndex, target: Target, showRumors: boolean, actions: PanelActions, time: number) {
  const tl = idx.world.timeline;
  const i = Math.min(Math.max(Math.floor(time), 0), tl.months.length - 1);
  root.replaceChildren();
  const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close details' }, '✕');
  close.addEventListener('click', actions.close);
  root.append(close);
  const visible = (e: WorldEdge) => showRumors || e.confidence !== 'inferred';

  if (target.kind === 'node') {
    const n = idx.node.get(target.id);
    if (!n) return;
    const district = idx.world.districts.find((d) => d.id === n.district);
    const pills = h(
      'div',
      { class: 'pills' },
      h('span', { class: `pill ${n.status === 'active' ? 'good' : n.status === 'deprecated' ? 'warn' : ''}` }, STATUS_LABEL[n.status]),
      n.stranded && h('span', { class: 'pill warn', title: 'No route from any active customer reaches this building' }, 'Stranded'),
      n.hiddenHighway && h('span', { class: 'pill highway', title: 'Carries a lot of customer traffic but few projects name it directly' }, 'Hidden highway'),
      n.primarySector && h('span', { class: 'pill' }, idx.world.sectors.find((s) => s.id === n.primarySector)?.name ?? n.primarySector),
    );
    const links = Object.entries(n.links).filter(([, url]) => url) as [string, string][];
    root.append(
      h('p', { class: 'eyebrow' }, district?.name ?? n.district, n.maintainer ? ` · ${n.maintainer}` : ''),
      h('h2', { tabindex: -1 }, n.name),
      pills,
      h('p', {}, n.description),
      nodeHistory(idx, n.id, i),
      h(
        'div',
        { class: 'facts' },
        h('div', { class: 'fact', 'data-role': 'traffic' }, h('b', {}, fmt(tl.nodes[n.id].traffic[i])), h('span', {}, `traffic in ${formatMonth(tl.months[i])}`)),
        h('div', { class: 'fact' }, h('b', {}, String(n.dependents)), h('span', {}, 'direct dependents')),
        h('div', { class: 'fact', 'data-role': 'size' }, h('b', {}, sizeAt(idx, n.id, i)), h('span', {}, 'building size')),
      ),
      links.length ? h('div', { class: 'links' }, ...links.map(([k, url]) => extLink(url, k === 'repo' ? 'Source code' : k === 'docs' ? 'Documentation' : 'Website'))) : '',
      (() => {
        const ships = nodeUpstream(idx, n.id, showRumors).customers.size;
        const trace = h('button', { type: 'button', class: 'primary-btn', disabled: ships === 0 }, ships ? `Trace back to its ${ships} ship${ships === 1 ? '' : 's'}` : 'No ship relies on it');
        trace.addEventListener('click', () => actions.follow(n.id));
        return trace;
      })(),
      n.packages.length ? h('p', { class: 'eyebrow' }, 'Packages: ', ...n.packages.map((p, i) => h('span', { class: 'mono' }, `${i ? ', ' : ''}${p.ecosystem}:${p.name}`))) : '',
      ...relationSection('Uses', idx, (idx.out.get(n.id) ?? []).filter(visible), 'to', actions, 'Uses nothing else on the island.'),
      ...relationSection('Used by', idx, (idx.incoming.get(n.id) ?? []).filter(visible), 'from', actions, 'Nothing on the island uses it yet.'),
      h('p', { class: 'eyebrow' }, `Last verified ${n.lastVerified}`),
    );
    return;
  }

  if (target.kind === 'customer') {
    const c = idx.customer.get(target.id);
    if (!c) return;
    const sector = idx.world.sectors.find((s) => s.id === c.harbor);
    const follow = h('button', { type: 'button', class: 'primary-btn' }, 'Follow this ship to the mountain');
    follow.addEventListener('click', () => actions.follow(c.id));
    root.append(
      h('p', { class: 'eyebrow' }, `${SHIP_LABEL[c.stage]} in the ${sector?.name ?? c.harbor} harbor`),
      h('h2', { tabindex: -1 }, c.name),
      h(
        'div',
        { class: 'pills' },
        h('span', { class: `pill ${c.stage === 'production' ? 'good' : c.stage === 'ended' ? 'warn' : ''}` }, STAGE_LABEL[c.stage]),
        h('span', { class: 'pill' }, c.type === 'segment' ? 'User segment' : c.type[0].toUpperCase() + c.type.slice(1)),
        ...c.sectors.slice(1).map((s) => h('span', { class: 'pill' }, idx.world.sectors.find((x) => x.id === s)?.name ?? s)),
      ),
      h('p', {}, c.description),
      customerHistory(idx, c.id, i),
      c.metric
        ? h('p', {}, h('b', { class: 'mono' }, String(c.metric.value)), ` ${c.metric.label} · `, extLink(c.metric.source, hostOf(c.metric.source)), h('span', { class: 'rel-meta' }, ` · ${c.metric.retrieved}`))
        : '',
      follow,
      ...relationSection('Uses', idx, (idx.out.get(c.id) ?? []).filter(visible), 'to', actions, 'No products recorded.'),
      h('p', { class: 'eyebrow' }, `Last verified ${c.lastVerified}`),
    );
    return;
  }

  const e = idx.edge.get(target.id);
  if (!e) return;
  const from = idx.node.get(e.from) ?? idx.customer.get(e.from);
  const to = idx.node.get(e.to);
  const fromBtn = h('button', { type: 'button' }, from?.name ?? e.from);
  const toBtn = h('button', { type: 'button' }, to?.name ?? e.to);
  fromBtn.addEventListener('click', () => actions.select({ kind: idx.node.has(e.from) ? 'node' : 'customer', id: e.from }));
  toBtn.addEventListener('click', () => actions.select({ kind: 'node', id: e.to }));
  root.append(
    h('p', { class: 'eyebrow' }, 'Road'),
    h('h2', { tabindex: -1 }, `${from?.name ?? e.from} → ${to?.name ?? e.to}`),
    h('div', { class: 'pills' }, e.relation ? h('span', { class: 'pill' }, RELATION_LABEL[e.relation]) : '', h('span', { class: `pill conf ${e.confidence}` }, e.confidence)),
    h(
      'div',
      { class: 'facts' },
      h('div', { class: 'fact' }, h('b', {}, fmt(e.traffic)), h('span', {}, 'customer traffic')),
      h('div', { class: 'fact' }, h('b', {}, fmt(e.trafficWithRumors)), h('span', {}, 'with rumors')),
      h('div', { class: 'fact' }, h('b', {}, String(e.path.length - 1)), h('span', {}, 'tiles long')),
    ),
    h('div', { class: 'rel-head' }, fromBtn, h('span', { class: 'rel-meta' }, 'uses'), toBtn),
    h('h3', {}, 'Sources'),
    evidenceList(e),
  );
}
