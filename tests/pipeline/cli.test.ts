import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const cli = (...args: string[]) => spawnSync(TSX, ['pipeline/cli.ts', ...args], { encoding: 'utf8' });

function copyFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'island-cli-'));
  cpSync('fixtures/mini', dir, { recursive: true });
  return dir;
}

describe('cli', () => {
  it('writes world.json and the lock file', () => {
    const data = copyFixture();
    const out = join(data, 'out', 'world.json');
    const r = cli('--data', data, '--out', out);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('6 buildings, 3 ships, 11 roads · 1 stranded · 2 hidden highways');
    expect(JSON.parse(readFileSync(out, 'utf8')).version).toBe(1);
    expect(readFileSync(join(data, 'layout.lock.json'), 'utf8')).toContain('"hearth-node"');
  }, 30_000);

  it('--check validates without writing anything', () => {
    const data = copyFixture();
    const out = join(data, 'world.json');
    const r = cli('--data', data, '--out', out, '--check');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('(check only, nothing written)');
    expect(existsSync(out)).toBe(false);
    expect(existsSync(join(data, 'layout.lock.json'))).toBe(false);
  }, 30_000);

  it('--check warns about an out-of-date lock, --strict fails on it', () => {
    const data = copyFixture();
    const out = join(mkdtempSync(join(tmpdir(), 'island-out-')), 'w.json');
    expect(cli('--data', data, '--out', out).status).toBe(0);
    const lock = join(data, 'layout.lock.json');
    writeFileSync(lock, readFileSync(lock, 'utf8').replace(/"swap-town": \[[^\]]*\]/, '"swap-town": [999, 999]'));
    const warn = cli('--data', data, '--check');
    expect(warn.status).toBe(0);
    expect(warn.stderr).toContain('layout.lock.json is out of date');
    const r = cli('--data', data, '--check', '--strict');
    expect(r.status).toBe(1);
    expect(cli('--data', data, '--out', out).status).toBe(0);
    expect(cli('--data', data, '--check', '--strict').status).toBe(0);
  }, 60_000);

  it('--strict treats a missing lock as out of date when there are buildings', () => {
    const r = cli('--data', copyFixture(), '--check', '--strict');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('layout.lock.json is out of date');
  }, 30_000);

  it('exits 1 and prints file-scoped errors', () => {
    const data = copyFixture();
    const file = join(data, 'nodes', 'swap-town.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('target: anvil-lib', 'target: missing-lib'));
    const r = cli('--data', data, '--check');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('nodes/swap-town.yaml: uses[0].target "missing-lib" not found');
    expect(r.stderr).toContain('1 error(s) — nothing was written.');
  }, 30_000);
});
