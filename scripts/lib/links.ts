import { customerFile, nodeFile, type LoadedData } from '../../pipeline/load';
import { cmp } from '../../pipeline/util';

/** Every URL the dataset cites, with the files citing it. */
export function collectUrls(data: LoadedData): { url: string; files: string[] }[] {
  const byUrl = new Map<string, Set<string>>();
  const add = (url: string | undefined, file: string) => {
    if (!url) return;
    const files = byUrl.get(url) ?? new Set<string>();
    files.add(file);
    byUrl.set(url, files);
  };
  for (const n of data.nodes) {
    const file = nodeFile(n.id);
    Object.values(n.links).forEach((u) => add(u, file));
    n.uses.forEach((u) => u.evidence.forEach((e) => add(e.url, file)));
  }
  for (const c of data.customers) {
    const file = customerFile(c.id);
    add(c.metric?.source, file);
    c.uses.forEach((u) => u.evidence.forEach((e) => add(e.url, file)));
  }
  return [...byUrl.keys()].sort(cmp).map((url) => ({ url, files: [...byUrl.get(url)!].sort(cmp) }));
}
