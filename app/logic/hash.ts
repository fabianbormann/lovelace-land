export type Target = { kind: 'node' | 'customer' | 'edge'; id: string };

const KINDS = new Set(['node', 'customer', 'edge']);

export function parseHash(hash: string): Target | null {
  const m = /^#?(\w+)=(.+)$/.exec(hash);
  if (!m || !KINDS.has(m[1])) return null;
  try {
    return { kind: m[1] as Target['kind'], id: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

export function formatHash(target: Target | null): string {
  return target ? `#${target.kind}=${encodeURIComponent(target.id)}` : '';
}
