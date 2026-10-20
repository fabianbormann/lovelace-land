/** Deterministic, locale-independent string comparison for sorting. */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
