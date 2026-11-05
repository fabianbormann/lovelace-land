import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { appendUse, buildPackageIndex, dependenciesIn } from '../../scripts/lib/manifests';
import { makeData, node } from '../helpers';

const data = makeData({
  nodes: [
    node('mesh', 'sdks', [], { packages: [{ ecosystem: 'npm', name: '@meshsdk/core' }] }),
    node('pallas', 'sdks', [], { packages: [{ ecosystem: 'cargo', name: 'pallas' }] }),
    node('ccl', 'sdks', [], { packages: [{ ecosystem: 'maven', name: 'com.bloxbean.cardano:cardano-client-lib' }] }),
    node('gouroboros', 'sdks', [], { packages: [{ ecosystem: 'go', name: 'github.com/blinklabs-io/gouroboros' }] }),
    node('pycardano', 'sdks', [], { packages: [{ ecosystem: 'pypi', name: 'pycardano' }] }),
  ],
});
const index = buildPackageIndex(data.nodes);

describe('dependenciesIn', () => {
  it('reads npm dependencies and devDependencies from package.json', () => {
    const text = JSON.stringify({ dependencies: { '@meshsdk/core': '^1.9.0', react: '18' }, peerDependencies: {} });
    expect(dependenciesIn('package.json', text, index)).toEqual(['mesh']);
  });

  it('reads cargo dependencies including workspace tables and renamed crates', () => {
    const text = '[dependencies]\npallas = "0.34"\nserde = "1"\n\n[workspace.dependencies]\nother = { package = "pallas", version = "0.34" }\n';
    expect(dependenciesIn('Cargo.toml', text, index)).toEqual(['pallas']);
  });

  it('finds maven coordinates in gradle and pom files', () => {
    expect(dependenciesIn('build.gradle', "implementation 'com.bloxbean.cardano:cardano-client-lib:0.7.2'", index)).toEqual(['ccl']);
    const pom = '<dependency><groupId>com.bloxbean.cardano</groupId>\n  <artifactId>cardano-client-lib</artifactId></dependency>';
    expect(dependenciesIn('pom.xml', pom, index)).toEqual(['ccl']);
  });

  it('reads go.mod requires and python requirements', () => {
    expect(dependenciesIn('go.mod', 'require (\n\tgithub.com/blinklabs-io/gouroboros v0.140.0\n)', index)).toEqual(['gouroboros']);
    expect(dependenciesIn('pyproject.toml', 'dependencies = [\n  "pycardano>=0.11",\n]', index)).toEqual(['pycardano']);
    expect(dependenciesIn('requirements.txt', 'PyCardano==0.11.1\nrequests', index)).toEqual(['pycardano']);
  });

  it('does not match a package name that is only a prefix', () => {
    expect(dependenciesIn('package.json', JSON.stringify({ dependencies: { '@meshsdk/core-cst': '1' } }), index)).toEqual([]);
    expect(dependenciesIn('Cargo.toml', '[dependencies]\npallas-codec = "0.34"\n', index)).toEqual([]);
  });

  it('ignores development and test-only dependencies', () => {
    expect(dependenciesIn('package.json', JSON.stringify({ devDependencies: { '@meshsdk/core': '1' } }), index)).toEqual([]);
    expect(dependenciesIn('Cargo.toml', '[dev-dependencies]\npallas = "0.34"\n', index)).toEqual([]);
    expect(dependenciesIn('build.gradle', "testImplementation 'com.bloxbean.cardano:cardano-client-lib:0.7.2'", index)).toEqual([]);
  });

  it('survives malformed manifests', () => {
    expect(dependenciesIn('package.json', '{ nope', index)).toEqual([]);
  });
});

describe('dependenciesIn — more manifest shapes', () => {
  it('reads single-line PEP 621 dependency arrays but not poetry dev groups', () => {
    expect(dependenciesIn('pyproject.toml', '[project]\ndependencies = ["pycardano>=0.9", "requests"]\n', index)).toEqual(['pycardano']);
    expect(dependenciesIn('pyproject.toml', '[tool.poetry.group.dev.dependencies]\npycardano = "^0.9"\n', index)).toEqual([]);
    expect(dependenciesIn('pyproject.toml', '[tool.poetry.dependencies]\npycardano = "^0.9"\n', index)).toEqual(['pycardano']);
  });

  it('reads cargo workspace inheritance and table-form dependencies', () => {
    expect(dependenciesIn('Cargo.toml', '[dependencies]\npallas.workspace = true\n', index)).toEqual(['pallas']);
    expect(dependenciesIn('Cargo.toml', '[dependencies.pallas]\nversion = "0.34"\n', index)).toEqual(['pallas']);
    expect(dependenciesIn('Cargo.toml', '[dev-dependencies.pallas]\nversion = "0.34"\n', index)).toEqual([]);
  });

  it('skips maven test-scoped dependencies', () => {
    const pom = '<dependency><groupId>com.bloxbean.cardano</groupId><artifactId>cardano-client-lib</artifactId><scope>test</scope></dependency>';
    expect(dependenciesIn('pom.xml', pom, index)).toEqual([]);
  });
});

describe('appendUse', () => {
  const entry = { target: 'whisky', relation: 'library', confidence: 'verified', evidence: [{ url: 'https://example.org/Cargo.toml', kind: 'manifest', retrieved: '2026-11-05' }] };
  const longLine = `description: ${'a long hand-wrapped line that is well over eighty characters wide '.repeat(2).trim()}`;
  const added = `  - target: whisky
    relation: library
    confidence: verified
    evidence:
      - url: https://example.org/Cargo.toml
        kind: manifest
        retrieved: 2026-11-05
`;

  it('adds the entry after the last road and leaves every other line as written', () => {
    const before = `id: midnight\n${longLine}\nuses:\n  - target: blaze\n    note: '"@blaze-cardano/core": "^0.8.0", "@blaze-cardano/data", "@blaze-cardano/uplc"'\nonchain:\n  scripts: []\n`;
    const after = appendUse(before, entry);
    expect(after).toBe(before.replace('onchain:', `${added}onchain:`));
    expect(parse(after).uses.map((u: { target: string }) => u.target)).toEqual(['blaze', 'whisky']);
  });

  it('turns an empty uses list into a block list', () => {
    const after = appendUse('id: a\nuses: []\nlastVerified: 2026-10-20\n', entry);
    expect(after).toBe(`id: a\nuses:\n${added}lastVerified: 2026-10-20\n`);
  });

  it('adds a uses list when the file has none', () => {
    expect(appendUse('id: a\nstatus: active', entry)).toBe(`id: a\nstatus: active\nuses:\n${added}`);
  });

  it('follows the indentation of the existing list', () => {
    const after = appendUse('id: a\nuses:\n- target: b\n', entry);
    expect(after).toBe(`id: a\nuses:\n- target: b\n${added.replace(/^  /gm, '')}`);
  });
});
