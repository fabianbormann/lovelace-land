import { describe, expect, it } from 'vitest';
import { buildPackageIndex, dependenciesIn } from '../../scripts/lib/manifests';
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
