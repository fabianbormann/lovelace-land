import { describe, expect, it } from 'vitest';
import { manifestUrlFrom, themeColorFrom, usableBrandColor } from '../../scripts/lib/brand-colors';

describe('themeColorFrom', () => {
  it('reads the theme-color meta tag in either attribute order and normalises it', () => {
    expect(themeColorFrom('<meta name="theme-color" content="#1E5BD8">')).toBe('#1e5bd8');
    expect(themeColorFrom("<meta content='#0af' name='theme-color' />")).toBe('#00aaff');
  });

  it('prefers the light variant when several are declared', () => {
    const html = '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#101010"><meta name="theme-color" media="(prefers-color-scheme: light)" content="#2266cc">';
    expect(themeColorFrom(html)).toBe('#2266cc');
  });

  it('returns null without a usable hex value', () => {
    expect(themeColorFrom('<meta name="theme-color" content="rgb(1,2,3)">')).toBeNull();
    expect(themeColorFrom('<title>x</title>')).toBeNull();
  });
});

describe('manifestUrlFrom', () => {
  it('resolves the web app manifest against the page URL', () => {
    expect(manifestUrlFrom('<link rel="manifest" href="/site.webmanifest">', 'https://example.org/app/')).toBe('https://example.org/site.webmanifest');
    expect(manifestUrlFrom('<link href="manifest.json" rel="manifest">', 'https://example.org/app/')).toBe('https://example.org/app/manifest.json');
    expect(manifestUrlFrom('<link rel="icon" href="/x.png">', 'https://example.org')).toBeNull();
  });
});

describe('usableBrandColor', () => {
  it('accepts saturated colors and rejects white, black and greys, which do not read as a brand on a roof', () => {
    expect(usableBrandColor('#1e5bd8')).toBe(true);
    expect(usableBrandColor('#ffffff')).toBe(false);
    expect(usableBrandColor('#000000')).toBe(false);
    expect(usableBrandColor('#111827')).toBe(false);
    expect(usableBrandColor('#f8fafc')).toBe(false);
    expect(usableBrandColor('#777777')).toBe(false);
  });
});
