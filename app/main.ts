import './style.css';
import type { World } from '../pipeline/emit';
import { formatHash, parseHash, type Target } from './logic/hash';
import { indexWorld, nodeUpstream, type WorldIndex } from './logic/index';
import { computeAppearance, defaultViewState, type Lens, type ViewState } from './logic/lenses';
import { formatMonth } from './logic/describe';
import { missingDataUrl, reportChooserUrl } from './logic/report';
import { search } from './logic/search';
import { cursorAt, flagsAt, seriesAt, statsAt } from './logic/time';
import { createIsland, type IslandMap } from './scene/island';
import { SECTOR_COLORS } from './scene/town';
import { h } from './ui/dom';
import { createListView } from './ui/listview';
import { renderPanel, updatePanelTime } from './ui/panel';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/** Deep links are a convenience; sandboxed embeds may refuse history changes. */
function setHash(hash: string) {
  try {
    history.replaceState(null, '', hash || location.pathname + location.search);
  } catch {
    /* ignore */
  }
}

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

/** Keep overlays clear of the header, whose height changes when it wraps on narrow screens. */
function trackHeaderHeight() {
  const bar = $('.bar');
  const timeline = $('.timeline');
  const app = $('#app');
  const update = () => {
    document.documentElement.style.setProperty('--bar-bottom', `${bar.offsetTop + bar.offsetHeight}px`);
    document.documentElement.style.setProperty('--timeline-space', `${app.clientHeight - timeline.offsetTop + 8}px`);
  };
  new ResizeObserver(update).observe(bar);
  new ResizeObserver(update).observe(timeline);
  new ResizeObserver(update).observe(app);
  update();
}

function start(world: World) {
  const idx = indexWorld(world);
  const state: ViewState = defaultViewState();
  let selected: Target | null = null;
  const panel = $('#panel');
  const listRoot = $('#listview');
  trackHeaderHeight();

  // The 3D island, or the list view when the browser cannot draw it.
  let island: IslandMap | null = null;
  if (webglAvailable()) {
    try {
      island = createIsland($('#map'), world, idx);
    } catch (e) {
      console.error('Could not start the 3D island', e);
      $('#map').replaceChildren();
    }
  }
  const hasGL = island !== null;
  $('#app').classList.toggle('no-gl', !hasGL);

  // Time axis: T is a continuous month position; everything shown is a function of it.
  const tl = world.timeline;
  const lastMonth = tl.months.length - 1;
  let T = lastMonth;
  state.time = lastMonth;

  let panelRumors = state.showRumors;
  const refresh = () => {
    island?.apply(computeAppearance(idx, state));
    document.querySelectorAll<HTMLButtonElement>('.lens').forEach((b) => {
      const on = b.dataset.lens === state.lens;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    const hint = $('#lens-hint');
    const followedShip = state.follow ? idx.customer.get(state.follow)?.name : null;
    const followedBuilding = state.follow ? idx.node.get(state.follow)?.name : null;
    const month = formatMonth(world.timeline.months[state.time ?? world.timeline.months.length - 1]);
    const text =
      state.lens === 'stranded'
        ? `${flagsAt(world, state.time ?? world.timeline.months.length - 1).stranded.size} buildings have no road to any active customer in ${month}.`
        : state.lens === 'highways'
          ? 'Glowing: buildings that carry heavy customer traffic but are named directly by few projects.'
          : state.lens === 'follow'
            ? followedShip
              ? `Following ${followedShip}: every road its goods travel, down to the mountain.`
              : followedBuilding
                ? (() => {
                    const ships = nodeUpstream(idx, state.follow!, state.showRumors).customers.size;
                    return ships
                      ? `Tracing ${followedBuilding} back to the ${ships} ship${ships === 1 ? '' : 's'} that rely on it.`
                      : `No ship relies on ${followedBuilding}: nothing reaches it from a harbor.`;
                  })()
                : 'Click a ship to follow its goods inland, or a building to trace it back to its ships.'
            : '';
    hint.textContent = text;
    hint.hidden = !text;
    // Only the rumor setting changes what the panel lists; re-rendering otherwise would steal focus.
    if (selected && panelRumors !== state.showRumors) showPanel(selected, { fly: false });
  };

  const showPanel = (target: Target, opts: { fly?: boolean; focus?: boolean } = {}) => {
    selected = target;
    panelRumors = state.showRumors;
    renderPanel(panel, idx, target, state.showRumors, {
      select: (t) => select(t, { focus: true }),
      follow: (id) => {
        state.lens = 'follow';
        state.follow = id;
        refresh();
      },
      close: () => select(null),
    }, T);
    panel.hidden = false;
    island?.setSelected(target);
    if (opts.fly ?? true) island?.focus(target, { liftForBottomPanel: matchMedia('(max-width: 720px)').matches });
    if (opts.focus) panel.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };

  const exists = (t: Target) => idx.node.has(t.id) || idx.customer.has(t.id) || idx.edge.has(t.id);
  const select = (target: Target | null, opts: { fly?: boolean; focus?: boolean } = {}) => {
    if (!target || !exists(target)) {
      selected = null;
      panel.hidden = true;
      island?.setSelected(null);
      setHash('');
      return;
    }
    if ((target.kind === 'customer' || target.kind === 'node') && state.lens === 'follow') {
      state.follow = target.id;
      refresh();
    }
    setHash(formatHash(target));
    showPanel(target, opts);
  };

  // List view (also the whole experience without WebGL)
  createListView(listRoot, idx, (t) => {
    if (hasGL) listRoot.hidden = true;
    select(t, { focus: true });
  });
  $('#list-btn').addEventListener('click', () => {
    listRoot.hidden = false;
    listRoot.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  });
  $('#list-close').addEventListener('click', () => {
    listRoot.hidden = true;
    $('#list-btn').focus();
  });
  if (!hasGL) {
    listRoot.hidden = false;
    $('#list-close').hidden = true;
    const note = $('#list-note');
    note.textContent = 'Your browser cannot draw the 3D island (WebGL is unavailable), so here is the same data as tables.';
    note.hidden = false;
  }

  // Lenses: a radio group, so arrow keys move between them
  const lensButtons = [...document.querySelectorAll<HTMLButtonElement>('.lens')];
  const chooseLens = (lens: Lens) => {
    state.lens = lens;
    if (state.lens === 'follow' && !state.follow && (selected?.kind === 'customer' || selected?.kind === 'node')) state.follow = selected.id;
    if (state.lens !== 'follow') state.follow = null;
    refresh();
  };
  lensButtons.forEach((b, i) => {
    b.addEventListener('click', () => chooseLens(b.dataset.lens as Lens));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = lensButtons[(i + (e.key === 'ArrowRight' ? 1 : -1) + lensButtons.length) % lensButtons.length];
      next.focus();
      chooseLens(next.dataset.lens as Lens);
    });
  });

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
  $<HTMLInputElement>('#toggle-reported').addEventListener('change', (e) => {
    state.hideReported = !(e.target as HTMLInputElement).checked;
    refresh();
  });

  setupSearch(idx, (t) => select(t, { focus: true }));

  // Timeline bar
  const slider = $<HTMLInputElement>('#tl-slider');
  const monthLabel = $('#tl-month');
  const playBtn = $('#tl-play');
  const speedBtn = $('#tl-speed');
  const spark = $<HTMLCanvasElement>('#tl-spark');
  slider.max = String(lastMonth);
  let playing = false;
  let speed = 1;
  let generation = 0;
  const setTime = (next: number) => {
    T = Math.min(Math.max(next, 0), lastMonth);
    const { index, month } = cursorAt(tl.months, T);
    slider.value = String(T);
    slider.setAttribute('aria-valuetext', formatMonth(month));
    monthLabel.textContent = formatMonth(month);
    island?.setTime(T);
    if (state.time !== index) {
      state.time = index;
      const s = statsAt(world, index);
      $('#stats').textContent = `${s.buildings} buildings · ${s.ships} ships docked · ${s.stranded} stranded · ${Math.round(s.tx).toLocaleString('en')} tx`;
      refresh();
      if (selected && !panel.hidden) updatePanelTime(panel, idx, selected, T);
    }
  };
  const setPlaying = (on: boolean) => {
    playing = on;
    playBtn.textContent = on ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', on ? 'Pause history' : 'Play history');
    if (on && T >= lastMonth) setTime(0);
    const mine = ++generation;
    let prev = performance.now();
    const step = (now: number) => {
      if (!playing || mine !== generation) return;
      const dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      setTime(T + dt * speed);
      if (T >= lastMonth) return setPlaying(false);
      requestAnimationFrame(step);
    };
    if (on) requestAnimationFrame(step);
  };
  playBtn.addEventListener('click', () => setPlaying(!playing));
  speedBtn.addEventListener('click', () => {
    speed = speed === 1 ? 4 : 1;
    speedBtn.textContent = `${speed}×`;
    speedBtn.setAttribute('aria-label', `Playback speed ${speed} times`);
  });
  $('#tl-now').addEventListener('click', () => {
    setPlaying(false);
    setTime(lastMonth);
  });
  slider.addEventListener('input', () => {
    setPlaying(false);
    setTime(Number(slider.value));
  });
  slider.addEventListener('keydown', (e) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -12, PageUp: 12 };
    if (e.key in steps) {
      e.preventDefault();
      setPlaying(false);
      const { index, frac } = cursorAt(tl.months, T);
      // step to the neighbouring month start; from mid-month, back goes to the start of this month
      setTime(steps[e.key] < 0 && frac > 0 ? index + steps[e.key] + 1 : index + steps[e.key]);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setPlaying(false);
      setTime(e.key === 'Home' ? 0 : lastMonth);
    }
  });
  const drawSpark = () => {
    const dpr = Math.min(devicePixelRatio, 2);
    spark.width = spark.clientWidth * dpr;
    spark.height = spark.clientHeight * dpr;
    const ctx = spark.getContext('2d');
    if (!ctx) return;
    const css = getComputedStyle(document.documentElement);
    const values = tl.totals.map((v) => Math.log10(1 + v));
    const max = Math.max(...values, 1e-9);
    const w = spark.width;
    const h = spark.height;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(0, h);
    values.forEach((v, i) => ctx.lineTo((i / Math.max(1, values.length - 1)) * w, h - (v / max) * (h - 6 * dpr) - 2 * dpr));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = css.getPropertyValue('--brass-soft').trim() || '#f1dfb4';
    ctx.fill();
    ctx.strokeStyle = css.getPropertyValue('--ink-soft').trim() || '#476377';
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
  };
  new ResizeObserver(drawSpark).observe(spark);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawSpark);

  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (e.key === 'Escape') {
      if (!panel.hidden) select(null);
      else if (hasGL && !listRoot.hidden) listRoot.hidden = true;
      else if (!filters.hidden) filtersBtn.click();
    }
    if (!island) return;
    if (e.key === 'q' || e.key === 'Q') island.stage.rotate(-1);
    if (e.key === 'e' || e.key === 'E') island.stage.rotate(1);
  });

  if (island) {
    const map = island;
    const tooltip = $('#tooltip');
    map.onHover((p) => {
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
              const traffic = seriesAt(tl.edges[world.edges.indexOf(e)], T);
              return `${idx.node.get(e.from)?.name ?? idx.customer.get(e.from)?.name} → ${idx.node.get(e.to)?.name} · traffic ${Math.round(traffic * 10) / 10}`;
            })()
          : t.kind === 'node'
            ? `${world.districts.find((d) => d.id === idx.node.get(t.id)?.district)?.name}`
            : t.kind === 'customer'
              ? `${idx.customer.get(t.id)?.stage} · click to see what it uses`
              : 'Harbor';
      tooltip.replaceChildren(t.kind === 'edge' ? 'Road' : (name ?? ''), h('small', {}, sub));
      tooltip.hidden = false;
      tooltip.style.left = `${Math.min(p.clientX + 14, innerWidth - tooltip.offsetWidth - 8)}px`;
      tooltip.style.top = `${Math.min(p.clientY + 14, innerHeight - tooltip.offsetHeight - 8)}px`;
    });
    map.onSelect((p) => {
      if (!p) return select(null);
      if (p.target.kind === 'sector') return;
      select(p.target as Target, { fly: false });
    });
    const settlersToggle = $<HTMLInputElement>('#toggle-settlers');
    settlersToggle.checked = !map.stage.reducedMotion;
    settlersToggle.addEventListener('change', () => map.setSettlers(settlersToggle.checked));
    $('#rotate-left').addEventListener('click', () => map.stage.rotate(-1));
    $('#rotate-right').addEventListener('click', () => map.stage.rotate(1));
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const forced = document.documentElement.dataset.theme;
      map.setNight(forced ? forced === 'dark' : dark.matches);
    };
    dark.addEventListener('change', applyTheme);
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    applyTheme();
  } else {
    $('.controls').hidden = true;
    $('.legend').hidden = true;
  }

  state.time = -1; // force the first setTime to fill stats and appearance
  setTime(lastMonth);
  const initial = parseHash(location.hash);
  if (initial && exists(initial)) select(initial);
  addEventListener('hashchange', () => {
    const t = parseHash(location.hash);
    if (t && exists(t)) select(t);
  });
}

function setupSearch(idx: WorldIndex, onPick: (t: Target) => void) {
  $<HTMLAnchorElement>('#report-btn').href = reportChooserUrl();
  const input = $<HTMLInputElement>('#search-input');
  const list = $('#search-results');
  let results: ReturnType<typeof search> = [];
  let active = 0;
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const choose = (i: number) => {
    const r = results[i];
    if (!r) return;
    input.value = '';
    results = [];
    close();
    onPick({ kind: r.kind, id: r.id });
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
    const query = input.value.trim();
    if (!results.length && query) {
      const missing = h(
        'li',
        { role: 'option', 'aria-disabled': 'true', class: 'search-missing' },
        'Nothing on the island by that name. ',
        h('a', { href: missingDataUrl(query), target: '_blank', rel: 'noopener noreferrer' }, `Suggest “${query}” on GitHub`),
      );
      // keep focus in the input so the list stays open long enough for the link to be clicked
      missing.addEventListener('mousedown', (e) => e.preventDefault());
      list.replaceChildren(missing);
    }
    list.hidden = !input.value.trim();
    input.setAttribute('aria-expanded', String(!list.hidden));
    if (results.length) input.setAttribute('aria-activedescendant', 'sr-0');
    else input.removeAttribute('aria-activedescendant');
  };
  input.addEventListener('input', render);
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      list.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', `sr-${active}`);
    } else if (e.key === 'Enter') {
      if (results.length) choose(active);
      else if (input.value.trim()) window.open(missingDataUrl(input.value), '_blank', 'noopener');
    }
    else if (e.key === 'Escape') close();
  });
}

$('#fog-retry').addEventListener('click', () => void boot());
void boot();
