/** Finding a project's brand color on its own website. */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalise(value: string): string | null {
  const v = value.trim();
  if (!HEX.test(v)) return null;
  const hex = v.slice(1).toLowerCase();
  return '#' + (hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex);
}

const attr = (tag: string, name: string) => new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1] ?? null;

/** The page's <meta name="theme-color">; with light and dark variants, the light one. */
export function themeColorFrom(html: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const candidates = tags
    .filter((t) => attr(t, 'name')?.toLowerCase() === 'theme-color')
    .map((t) => ({ color: normalise(attr(t, 'content') ?? ''), media: attr(t, 'media') ?? '' }))
    .filter((c): c is { color: string; media: string } => c.color !== null);
  const light = candidates.find((c) => /light/.test(c.media)) ?? candidates.find((c) => !/dark/.test(c.media));
  return (light ?? candidates[0])?.color ?? null;
}

/** The absolute URL of the page's web app manifest, if it links one. */
export function manifestUrlFrom(html: string, pageUrl: string): string | null {
  const tag = (html.match(/<link\b[^>]*>/gi) ?? []).find((t) => attr(t, 'rel')?.toLowerCase().split(/\s+/).includes('manifest'));
  const href = tag && attr(tag, 'href');
  if (!href) return null;
  try {
    return new URL(href, pageUrl).toString();
  } catch {
    return null;
  }
}

export function themeColorFromManifest(json: unknown): string | null {
  const v = (json as { theme_color?: unknown })?.theme_color;
  return typeof v === 'string' ? normalise(v) : null;
}

/** Saturated, mid-light colors read as a brand on a roof; white, black and greys do not. */
export function usableBrandColor(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return s >= 0.3 && l >= 0.15 && l <= 0.85;
}
