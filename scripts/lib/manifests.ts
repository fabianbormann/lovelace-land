import type { Node } from '../../pipeline/schema';

/** ecosystem → package name (lowercased) → node ids that publish it */
export type PackageIndex = Map<string, Map<string, string[]>>;

export function buildPackageIndex(nodes: Node[]): PackageIndex {
  const index: PackageIndex = new Map();
  for (const n of nodes)
    for (const p of n.packages) {
      const byName = index.get(p.ecosystem) ?? new Map<string, string[]>();
      const key = p.name.toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), n.id]);
      index.set(p.ecosystem, byName);
    }
  return index;
}

export const MANIFESTS: Record<string, string> = {
  'package.json': 'npm',
  'Cargo.toml': 'cargo',
  'build.gradle': 'maven',
  'build.gradle.kts': 'maven',
  'pom.xml': 'maven',
  'go.mod': 'go',
  'pyproject.toml': 'pypi',
  'requirements.txt': 'pypi',
};

function namesIn(file: string, text: string): string[] {
  switch (file) {
    case 'package.json': {
      try {
        const json = JSON.parse(text);
        // devDependencies are build and test tooling, not a runtime dependency of the project
        return ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap((k) => Object.keys(json[k] ?? {}));
      } catch {
        return [];
      }
    }
    case 'Cargo.toml': {
      const names: string[] = [];
      let inDeps = false;
      for (const line of text.split('\n')) {
        const section = /^\s*\[([^\]]+)\]/.exec(line);
        if (section) {
          inDeps = /(^|\.)(build-)?dependencies$/.test(section[1].trim());
          continue;
        }
        if (!inDeps) continue;
        const entry = /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line);
        if (entry) names.push(entry[1]);
        const renamed = /package\s*=\s*"([^"]+)"/.exec(line);
        if (renamed) names.push(renamed[1]);
      }
      return names;
    }
    case 'pom.xml': {
      const names: string[] = [];
      for (const m of text.matchAll(/<groupId>\s*([^<\s]+)\s*<\/groupId>\s*<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g)) names.push(`${m[1]}:${m[2]}`);
      return names;
    }
    case 'build.gradle':
    case 'build.gradle.kts':
      return text
        .split('\n')
        .filter((line) => !/^\s*test\w*\s*[( ]/.test(line))
        .flatMap((line) => [...line.matchAll(/['"]([\w.-]+):([\w.-]+)(?::[^'"]*)?['"]/g)].map((m) => `${m[1]}:${m[2]}`));
    case 'go.mod':
      return [...text.matchAll(/^\s*(?:require\s+)?([\w.-]+\.[\w.-]+\/[\w./-]+)\s+v[\w.+-]+/gm)].map((m) => m[1]);
    case 'pyproject.toml':
    case 'requirements.txt':
      return [...text.matchAll(/^\s*"?([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=!~;"]|$)/gm)].map((m) => m[1]);
    default:
      return [];
  }
}

/** Node ids whose published packages appear as dependencies in a manifest file. */
export function dependenciesIn(file: string, text: string, index: PackageIndex): string[] {
  const ecosystem = MANIFESTS[file];
  const byName = ecosystem ? index.get(ecosystem) : undefined;
  if (!byName) return [];
  const normalize = (n: string) => (ecosystem === 'pypi' ? n.toLowerCase().replace(/_/g, '-') : n.toLowerCase());
  const found = new Set<string>();
  for (const name of namesIn(file, text)) for (const id of byName.get(normalize(name)) ?? []) found.add(id);
  return [...found].sort();
}
