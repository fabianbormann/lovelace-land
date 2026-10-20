import { describe, expect, it } from 'vitest';
import { loadDataDir } from '../../pipeline/load';
import { validateReferences } from '../../pipeline/validate';
import { customer, district, makeData, node, sector } from '../helpers';

describe('validateReferences', () => {
  it('accepts the mini fixture', () => {
    const { data } = loadDataDir('fixtures/mini');
    expect(validateReferences(data)).toEqual({ errors: [], warnings: [] });
  });

  it('reports an unknown edge target in the spec format', () => {
    const data = makeData({ nodes: [node('foo', 'core', ['a', 'bar']), node('a', 'core')] });
    expect(validateReferences(data).errors).toEqual(['nodes/foo.yaml: uses[1].target "bar" not found']);
  });

  it('rejects self-references and duplicate targets', () => {
    const data = makeData({ nodes: [node('a', 'core', ['a']), node('b', 'core', ['a', 'a'])] });
    expect(validateReferences(data).errors).toEqual([
      'nodes/a.yaml: uses[0].target cannot point to itself',
      'nodes/b.yaml: uses[1].target "a" is listed twice',
    ]);
  });

  it('rejects edges that point at customers', () => {
    const data = makeData({
      nodes: [node('a', 'core', ['c']), node('p', 'products')],
      customers: [customer('c', ['defi'], ['p']), customer('d', ['defi'], ['c'])],
    });
    expect(validateReferences(data).errors).toEqual([
      'nodes/a.yaml: uses[0].target "c" is a customer; only nodes can be used',
      'customers/d.yaml: uses[0].target "c" is a customer; only nodes can be used',
    ]);
  });

  it('reports unknown districts and sectors', () => {
    const data = makeData({
      nodes: [node('a', 'nowhere'), node('p', 'products')],
      customers: [customer('c', ['defi', 'mars'], ['p'])],
    });
    expect(validateReferences(data).errors).toEqual([
      'nodes/a.yaml: district "nowhere" not found in districts.yaml',
      'customers/c.yaml: sectors[1] "mars" not found in sectors.yaml',
    ]);
  });

  it('only allows primarySector on town districts and requires it to exist', () => {
    const data = makeData({
      nodes: [node('app', 'products', [], { primarySector: 'mars' }), node('lib', 'sdks', [], { primarySector: 'defi' })],
    });
    expect(validateReferences(data).errors).toEqual([
      'nodes/app.yaml: primarySector "mars" not found in sectors.yaml',
      'nodes/lib.yaml: primarySector is only allowed in districts whose building is "town"',
    ]);
  });

  it('rejects an id used by both a node and a customer', () => {
    const data = makeData({ nodes: [node('x', 'products')], customers: [customer('x', ['defi'], ['x'])] });
    expect(validateReferences(data).errors).toContain('customers/x.yaml: id "x" is also used by nodes/x.yaml');
  });

  it('rejects duplicate district and sector ids', () => {
    const data = makeData({
      districts: [district('core', 0), district('core', 1)],
      sectors: [sector('defi'), sector('defi')],
    });
    expect(validateReferences(data).errors).toEqual([
      'districts.yaml: [1].id "core" is listed twice',
      'sectors.yaml: [1].id "defi" is listed twice',
    ]);
  });

  it('warns when a segment has no metric', () => {
    const data = makeData({
      nodes: [node('p', 'products')],
      customers: [customer('traders', ['defi'], ['p'], { type: 'segment' })],
    });
    expect(validateReferences(data)).toEqual({
      errors: [],
      warnings: ['customers/traders.yaml: segment has no metric; add a sourced metric so its harbor shows how big it is'],
    });
  });
});
