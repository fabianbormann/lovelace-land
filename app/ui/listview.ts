import type { Target } from '../logic/hash';
import type { WorldIndex } from '../logic/index';
import { tierName } from '../scene/town';
import { fmt, h } from './dom';

export type Tab = 'nodes' | 'customers' | 'edges';
export interface Column {
  key: string;
  label: string;
  num?: boolean;
  /** sort value */
  value: (row: Row) => string | number;
  /** shown text, when it differs from the sort value */
  display?: (row: Row) => string;
}
export interface Row {
  target: Target;
  cells: Record<string, string | number>;
}

export function tableRows(idx: WorldIndex, tab: Tab): { columns: Column[]; rows: Row[] } {
  const { world } = idx;
  const districtName = new Map(world.districts.map((d) => [d.id, d.name] as const));
  const sectorName = new Map(world.sectors.map((s) => [s.id, s.name] as const));
  const col = (key: string, label: string, num = false): Column => ({ key, label, num, value: (r) => r.cells[key] });
  if (tab === 'nodes')
    return {
      columns: [
        col('name', 'Name'),
        col('district', 'District'),
        col('status', 'Status'),
        col('traffic', 'Traffic', true),
        col('dependents', 'Dependents', true),
        { key: 'size', label: 'Size', value: (r) => r.cells.size, display: (r) => tierName(r.cells.size as number) },
        col('flags', 'Flags'),
      ],
      rows: world.nodes.map((n) => ({
        target: { kind: 'node', id: n.id },
        cells: {
          name: n.name,
          district: districtName.get(n.district) ?? n.district,
          status: n.status,
          traffic: n.traffic,
          dependents: n.dependents,
          size: n.tier,
          flags: [n.stranded && 'stranded', n.hiddenHighway && 'hidden highway'].filter(Boolean).join(', '),
        },
      })),
    };
  if (tab === 'customers')
    return {
      columns: [col('name', 'Name'), col('harbor', 'Harbor'), col('type', 'Type'), col('stage', 'Stage'), col('uses', 'Uses')],
      rows: world.customers.map((c) => ({
        target: { kind: 'customer', id: c.id },
        cells: {
          name: c.name,
          harbor: sectorName.get(c.harbor) ?? c.harbor,
          type: c.type,
          stage: c.stage,
          uses: (idx.out.get(c.id) ?? []).map((e) => idx.node.get(e.to)?.name ?? e.to).join(', '),
        },
      })),
    };
  const name = (id: string) => idx.node.get(id)?.name ?? idx.customer.get(id)?.name ?? id;
  return {
    columns: [col('from', 'From'), col('to', 'To'), col('relation', 'Relation'), col('confidence', 'Confidence'), col('traffic', 'Traffic', true), col('sources', 'Sources', true)],
    rows: world.edges.map((e) => ({
      target: { kind: 'edge', id: e.id },
      cells: { from: name(e.from), to: name(e.to), relation: e.relation ?? 'customer', confidence: e.confidence, traffic: e.traffic, sources: e.evidence.length },
    })),
  };
}

export function createListView(root: HTMLElement, idx: WorldIndex, onPick: (t: Target) => void) {
  const table = root.querySelector<HTMLTableElement>('#list-table')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  let tab: Tab = 'nodes';
  let sort = { key: 'traffic', dir: -1 };

  const render = (focusKey?: string) => {
    const { columns, rows: data } = tableRows(idx, tab);
    if (!columns.some((c) => c.key === sort.key)) sort = { key: columns[0].key, dir: 1 };
    const column = columns.find((c) => c.key === sort.key)!;
    data.sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
    const head = h('tr', {}, ...columns.map((c) => {
      const th = h('th', { scope: 'col', 'aria-sort': c.key === sort.key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined, tabindex: 0 }, c.label);
      th.dataset.key = c.key;
      const toggle = () => {
        sort = sort.key === c.key ? { key: c.key, dir: -sort.dir } : { key: c.key, dir: c.num ? -1 : 1 };
        render(c.key);
      };
      th.addEventListener('click', toggle);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
      return th;
    }));
    const body = h('tbody', {}, ...data.map((r) => {
      const tr = h('tr', { tabindex: 0 }, ...columns.map((c) => {
        const v = c.value(r);
        return h('td', { class: c.num ? 'num' : undefined }, c.display ? c.display(r) : typeof v === 'number' ? fmt(v) : v);
      }));
      tr.addEventListener('click', () => onPick(r.target));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(r.target);
        }
      });
      return tr;
    }));
    table.replaceChildren(h('thead', {}, head), body);
    if (focusKey) table.querySelector<HTMLElement>(`th[data-key="${focusKey}"]`)?.focus();
  };

  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tab = t.dataset.tab as Tab;
      tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      render();
    }),
  );
  render();
  return { render };
}
