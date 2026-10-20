import { describe, expect, it } from 'vitest';
import { missingDataUrl, reportChooserUrl, wrongDataUrl } from '../../app/logic/report';

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe('report links', () => {
  it('opens the wrong-data form with the building, ship or road filled in', () => {
    const url = wrongDataUrl({ kind: 'node', id: 'lace', name: 'Lace' });
    expect(url.startsWith('https://github.com/fabianbormann/lovelace-land/issues/new?')).toBe(true);
    expect(params(url)).toEqual({ template: 'wrong-data.yml', title: 'Wrong data: Lace', what: 'Lace (building lace)' });
    expect(params(wrongDataUrl({ kind: 'customer', id: 'azzas-2154', name: 'Azzas 2154' })).what).toBe('Azzas 2154 (ship azzas-2154)');
    expect(params(wrongDataUrl({ kind: 'edge', id: 'lace->cardano-js-sdk', name: 'Lace → Cardano JS SDK' })).what).toBe('Lace → Cardano JS SDK (road lace->cardano-js-sdk)');
  });

  it('opens the missing-data form with the searched name filled in', () => {
    expect(params(missingDataUrl('Pavia'))).toEqual({ template: 'missing-data.yml', title: 'Missing: Pavia', name: 'Pavia' });
    expect(params(missingDataUrl('  '))).toEqual({ template: 'missing-data.yml' });
  });

  it('has a general entry point that lets people pick the form', () => {
    expect(reportChooserUrl()).toBe('https://github.com/fabianbormann/lovelace-land/issues/new/choose');
  });
});
