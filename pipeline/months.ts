/** Months are "YYYY-MM" strings. */
const toIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

export const monthOf = (iso: string) => iso.slice(0, 7);
export const monthDiff = (a: string, b: string) => toIndex(b) - toIndex(a);

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = toIndex(from); i <= toIndex(to); i++) out.push(fromIndex(i));
  return out;
}
