import type { Target } from './hash';

/** Where data reports go: the issue forms in .github/ISSUE_TEMPLATE. */
const ISSUES = 'https://github.com/fabianbormann/lovelace-land/issues/new';
const KIND_WORD: Record<Target['kind'], string> = { node: 'building', customer: 'ship', edge: 'road' };

const form = (fields: Record<string, string>) => `${ISSUES}?${new URLSearchParams(fields)}`;

/** The wrong-data form with the building, ship or road already named. */
export function wrongDataUrl(t: Target & { name: string }): string {
  return form({ template: 'wrong-data.yml', title: `Wrong data: ${t.name}`, what: `${t.name} (${KIND_WORD[t.kind]} ${t.id})` });
}

/** The missing-data form, with the name someone searched for when there is one. */
export function missingDataUrl(name = ''): string {
  const n = name.trim();
  return form(n ? { template: 'missing-data.yml', title: `Missing: ${n}`, name: n } : { template: 'missing-data.yml' });
}

export const reportChooserUrl = () => `${ISSUES}/choose`;
