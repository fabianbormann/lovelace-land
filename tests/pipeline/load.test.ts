import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPath, loadDataDir } from '../../pipeline/load';

const DISTRICTS = `- { id: core, name: Core, description: d, building: relay-tower, order: 0, color: "#111111" }\n`;
const SECTORS = `- { id: defi, name: DeFi, description: d, inclusion: i, coast: east }\n`;
const NODE_A = `id: a\nname: A\ndistrict: core\ndescription: d\nstatus: active\nlastVerified: 2026-10-20\n`;

function writeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'island-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  return dir;
}

describe('formatPath', () => {
  it('formats zod paths like uses[1].target', () => {
    expect(formatPath(['uses', 1, 'target'])).toBe('uses[1].target');
    expect(formatPath([0, 'color'])).toBe('[0].color');
    expect(formatPath([])).toBe('');
  });
});

describe('loadDataDir', () => {
  it('loads the mini fixture without errors', () => {
    const { data, errors } = loadDataDir('fixtures/mini');
    expect(errors).toEqual([]);
    expect(data.districts.map((d) => d.id)).toEqual(['core', 'indexers', 'sdks', 'products']);
    expect(data.sectors).toHaveLength(2);
    expect(data.nodes.map((n) => n.id)).toEqual([
      'anvil-lib',
      'hearth-node',
      'lonely-tool',
      'mill-indexer',
      'seal-notary',
      'swap-town',
    ]);
    expect(data.customers.map((c) => c.id)).toEqual(['guild-of-scribes', 'harbor-traders', 'old-pilot']);
  });

  it('reports missing districts.yaml and sectors.yaml', () => {
    const { errors } = loadDataDir(writeTree({}));
    expect(errors).toEqual(['districts.yaml: file not found', 'sectors.yaml: file not found']);
  });

  it('treats missing nodes/ and customers/ folders as empty', () => {
    const { data, errors } = loadDataDir(writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS }));
    expect(errors).toEqual([]);
    expect(data.nodes).toEqual([]);
    expect(data.customers).toEqual([]);
  });

  it('reports invalid YAML with the file name', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/a.yaml': 'id: [unclosed' });
    const { errors } = loadDataDir(dir);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^nodes\/a\.yaml: invalid YAML/);
  });

  it('requires the id to match the filename', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/b.yaml': NODE_A });
    expect(loadDataDir(dir).errors).toEqual(['nodes/b.yaml: id "a" must match the filename "b"']);
  });

  it('rejects .yml files instead of skipping them', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/a.yml': NODE_A });
    expect(loadDataDir(dir).errors).toEqual(['nodes/a.yml: use the .yaml extension']);
  });

  it('ignores hidden files and non-YAML files', () => {
    const dir = writeTree({
      'districts.yaml': DISTRICTS,
      'sectors.yaml': SECTORS,
      'nodes/.gitkeep': '',
      'nodes/README.md': '# notes',
    });
    expect(loadDataDir(dir).errors).toEqual([]);
  });

  it('reports a typo key with file and message', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/a.yaml': NODE_A + 'use: []\n' });
    expect(loadDataDir(dir).errors).toEqual(["nodes/a.yaml: Unrecognized key(s) in object: 'use'"]);
  });

  it('reports nested schema errors with a readable path', () => {
    const yaml =
      NODE_A +
      'uses:\n  - target: b\n    relation: library\n    confidence: verified\n    evidence:\n      - kind: docs\n        retrieved: 2026-10-20\n';
    const dir = writeTree({ 'districts.yaml': DISTRICTS, 'sectors.yaml': SECTORS, 'nodes/a.yaml': yaml });
    expect(loadDataDir(dir).errors).toEqual(['nodes/a.yaml: uses[0].evidence[0].url Required']);
  });

  it('reports errors inside districts.yaml with the list index', () => {
    const dir = writeTree({ 'districts.yaml': DISTRICTS.replace('#111111', 'brown'), 'sectors.yaml': SECTORS });
    expect(loadDataDir(dir).errors).toEqual(['districts.yaml: [0].color must be a hex color like #6b8e23']);
  });
});
