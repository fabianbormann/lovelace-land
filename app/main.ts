import './style.css';
import type { World } from '../pipeline/emit';
import { formatHash, parseHash, type Target } from './logic/hash';
import { indexWorld, type WorldIndex } from './logic/index';
import { computeAppearance, defaultViewState, type Lens, type ViewState } from './logic/lenses';
import { search } from './logic/search';
import { createIsland, type IslandMap } from './scene/island';
import { SECTOR_COLORS } from './scene/town';
import { h } from './ui/dom';
import { createListView } from './ui/listview';
import { renderPanel } from './ui/panel';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function loadWorld(): Promise<World> {
  const res = await fetch('world.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`world.json answered ${res.status}`);
  return res.json();
}

async function boot() {
  const fog = $('#fog');
  let world: World;
  try {
    world = await loadWorld();
    fog.hidden = true;
  } catch (e) {
    $('#fog-detail').textContent = `The island data could not be loaded (${(e as Error).message}). Check your connection and try again.`;
    fog.hidden = false;
    return;
  }
  start(world);
}

function start(world: World) {
  const idx = indexWorld(world);
  const state: ViewState = defaultViewState();
  let selected: Target | null = null;
  const panel = $('#panel');
  const hasGL = webglAvailable();
  let island: IslandMap | null = null;

  $('#stats').textContent = [
    `${world.nodes.length} buildings`,
    `${world.customers.length} ships`,
    `${world.edges.filter((e) => e.confidence !== 'inferred').length} roads`,
    `${world.nodes.filter((n) => n.stranded).length} stranded`,
    `${world.nodes.filter((n) => n.hiddenHighway).length} hidden highways`,
  ].join(' · ');

  const refresh = () => {
    island?.apply(computeAppearance(idx, state));
    document.querySelectorAll<HTMLButtonElement>('.lens').forEach((b) => {
      const on = b.dataset.lens === state.lens;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
    const hint = $('#lens-hint');
    const followed = state.follow ? idx.customer.get(state.follow)?.name : null;
    const text =
      state.lens === 'stranded'
        ? `${world.nodes.filter((n) => n.stranded).length} buildings have no road to any active customer.`
        : state.lens === 'highways'
          ? 'Glowing: buildings that carry heavy customer traffic but are named directly by few projects.'
          : state.lens === 'follow'
            ? followed
              ? `Following ${followed}: every road its goods travel, down to the mountain.`
              : 'Click a ship in a harbor to follow its goods inland.'
            : '';
    hint.textContent = text;
    hint.hidden = !text;
    if (selected) showPanel(selected, false);
  };

  const showPanel = (target: Target, fly = true) => {
    selected = target;
    renderPanel(panel, idx, target, state.showRumors, {
      select: (t) => select(t),
      follow: (id) => {
        state.lens = 'follow';
        state.follow = id;
        refresh();
      },
      close: () => select(null),
    });
    panel.hidden = false;
    island?.setSelected(target);
    if (fly) island?.focus(target);
  };

  const select = (target: Target | null, fly = true) => {
    if (!target) {
      selected = null;
      panel.hidden = true;
      island?.setSelected(null);
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    if (target.kind === 'customer' && state.lens === 'follow') {
      state.follow = target.id;
      refresh();
    }
    history.replaceState(null, '', formatHash(target));
    showPanel(target, fly);
  };

  // List view (also the fallback without WebGL)
  const listRoot = $('#listview');
  createListView(listRoot, idx, (t) => {
    if (hasGL) listRoot.hidden = true;
    select(t);
  });
  $('#list-btn').addEventListener('click', () => (listRoot.hidden = false));
  $('#list-close').addEventListener('click', () => (listRoot.hidden = true));
  if (!hasGL) {
    listRoot.hidden = false;
    $('#list-close').hidden = true;
    const note = $('#list-note');
    note.textContent = 'Your browser cannot draw the 3D island (WebGL is unavailable), so here is the same data as tables.';
    note.hidden = false;
  }

  // Lenses
  document.querySelectorAll<HTMLButtonElement>('.lens').forEach((b) =>
    b.addEventListener('click', () => {
      state.lens = b.dataset.lens as Lens;
      if (state.lens === 'follow' && !state.follow && selected?.kind === 'customer') state.follow = selected.id;
      if (state.lens !== 'follow') state.follow = null;
      refresh();
    }),
  );

  // Filters
  const filtersBtn = $('#filters-btn');
  const filters = $('#filters');
  filtersBtn.addEventListener('click', () => {
    filters.hidden = !filters.hidden;
    filtersBtn.setAttribute('aria-expanded', String(!filters.hidden));
  });
  const checkbox = (id: string, label: string, color: string, set: Set<string>) => {
    const input = h('input', { type: 'checkbox', id, checked: true });
    input.addEventListener('change', () => {
      if (input.checked) set.delete(id.slice(id.indexOf('-') + 1));
      else set.add(id.slice(id.indexOf('-') + 1));
      refresh();
    });
    const dot = h('span', { class: 'dot' });
    dot.style.background = color;
    return h('label', {}, input, dot, label);
  };
  $('#filter-districts').append(...world.districts.map((d) => checkbox(`d-${d.id}`, d.name, d.color, state.hiddenDistricts)));
  $('#filter-sectors').append(...world.sectors.map((s, i) => checkbox(`s-${s.id}`, s.name, SECTOR_COLORS[i % SECTOR_COLORS.length], state.hiddenSectors)));
  $<HTMLInputElement>('#toggle-rumors').addEventListener('change', (e) => {
    state.showRumors = (e.target as HTMLInputElement).checked;
    refresh();
  });

  if (innerWidth < 1100) $<HTMLDetailsElement>('.legend').open = false;

  // Search
  setupSearch(idx, (t) => select(t));

  if (hasGL) {
    island = createIsland($('#map'), world, idx);
    const tooltip = $('#tooltip');
    island.onHover((p) => {
      if (!p) {
        tooltip.hidden = true;
        return;
      }
      const t = p.target;
      const name =
        t.kind === 'node' ? idx.node.get(t.id)?.name : t.kind === 'customer' ? idx.customer.get(t.id)?.name : t.kind === 'sector' ? world.sectors.find((s) => s.id === t.id)?.name : null;
      const sub =
        t.kind === 'edge'
          ? (() => {
              const e = idx.edge.get(t.id)!;
              return `${idx.node.get(e.from)?.name ?? idx.customer.get(e.from)?.name} → ${idx.node.get(e.to)?.name} · traffic ${e.traffic}`;
            })()
          : t.kind === 'node'
            ? `${world.districts.find((d) => d.id === idx.node.get(t.id)?.district)?.name}`
            : t.kind === 'customer'
              ? `${idx.customer.get(t.id)?.stage} · click to see what it uses`
              : 'Harbor';
      tooltip.replaceChildren(t.kind === 'edge' ? 'Road' : (name ?? ''), h('small', {}, sub));
      tooltip.style.left = `${p.clientX + 14}px`;
      tooltip.style.top = `${p.clientY + 14}px`;
      tooltip.hidden = false;
    });
    island.onSelect((p) => {
      if (!p) return select(null, false);
      if (p.target.kind === 'sector') return;
      select(p.target as Target, false);
    });
    const settlersToggle = $<HTMLInputElement>('#toggle-settlers');
    settlersToggle.checked = !island.stage.reducedMotion;
    settlersToggle.addEventListener('change', () => island!.setSettlers(settlersToggle.checked));
    $('#rotate-left').addEventListener('click', () => island!.stage.rotate(-1));
    $('#rotate-right').addEventListener('click', () => island!.stage.rotate(1));
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'q' || e.key === 'Q') island!.stage.rotate(-1);
      if (e.key === 'e' || e.key === 'E') island!.stage.rotate(1);
      if (e.key === 'Escape') select(null);
    });
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const forced = document.documentElement.dataset.theme;
      island!.setNight(forced ? forced === 'dark' : dark.matches);
    };
    dark.addEventListener('change', applyTheme);
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    applyTheme();
  }

  refresh();
  const initial = parseHash(location.hash);
  if (initial && (idx.node.has(initial.id) || idx.customer.has(initial.id) || idx.edge.has(initial.id))) select(initial);
  addEventListener('hashchange', () => {
    const t = parseHash(location.hash);
    if (t) select(t);
  });
}

function setupSearch(idx: WorldIndex, onPick: (t: Target) => void) {
  const input = $<HTMLInputElement>('#search-input');
  const list = $('#search-results');
  let results: ReturnType<typeof search> = [];
  let active = 0;
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };
  const choose = (i: number) => {
    const r = results[i];
    if (!r) return;
    onPick({ kind: r.kind, id: r.id });
    input.value = '';
    close();
    input.blur();
  };
  const render = () => {
    results = search(idx, input.value);
    active = 0;
    list.replaceChildren(
      ...results.map((r, i) => {
        const li = h('li', { role: 'option', id: `sr-${i}`, 'aria-selected': String(i === active) }, h('span', {}, r.name), h('small', {}, r.subtitle));
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          choose(i);
        });
        return li;
      }),
    );
    if (!results.length && input.value.trim()) list.replaceChildren(h('li', { role: 'option', 'aria-disabled': 'true' }, 'Nothing on the island by that name'));
    list.hidden = !input.value.trim();
    input.setAttribute('aria-expanded', String(!list.hidden));
  };
  input.addEventListener('input', render);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1);
      list.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', `sr-${active}`);
    } else if (e.key === 'Enter') choose(active);
    else if (e.key === 'Escape') close();
  });
}

$('#fog-retry').addEventListener('click', () => void boot());
void boot();
