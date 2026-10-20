import { customerFile, nodeFile, type LoadedData } from './load';
import type { District } from './schema';

export function validateReferences(data: LoadedData): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const districts = new Map<string, District>();
  data.districts.forEach((d, i) => {
    if (districts.has(d.id)) errors.push(`districts.yaml: [${i}].id "${d.id}" is listed twice`);
    else districts.set(d.id, d);
  });
  const sectorIds = new Set<string>();
  data.sectors.forEach((s, i) => {
    if (sectorIds.has(s.id)) errors.push(`sectors.yaml: [${i}].id "${s.id}" is listed twice`);
    sectorIds.add(s.id);
  });

  const nodeIds = new Set(data.nodes.map((n) => n.id));
  const customerIds = new Set(data.customers.map((c) => c.id));

  const checkUses = (file: string, selfId: string, uses: { target: string }[]) => {
    const seen = new Set<string>();
    uses.forEach((u, i) => {
      const at = `${file}: uses[${i}].target`;
      if (u.target === selfId) errors.push(`${at} cannot point to itself`);
      else if (seen.has(u.target)) errors.push(`${at} "${u.target}" is listed twice`);
      else if (customerIds.has(u.target) && !nodeIds.has(u.target))
        errors.push(`${at} "${u.target}" is a customer; only nodes can be used`);
      else if (!nodeIds.has(u.target)) errors.push(`${at} "${u.target}" not found`);
      seen.add(u.target);
    });
  };

  const checkWindow = (file: string, active: { from: string; until?: string; confirmed?: string } | undefined) => {
    if (!active) return;
    const { from, until, confirmed } = active;
    if (until && until < from) errors.push(`${file}: active.until ${until} is before active.from ${from}`);
    if (confirmed && confirmed < from) errors.push(`${file}: active.confirmed ${confirmed} is before active.from ${from}`);
    if (confirmed && until && confirmed > until) errors.push(`${file}: active.confirmed ${confirmed} is after active.until ${until}`);
  };

  for (const n of data.nodes) {
    const file = nodeFile(n.id);
    checkWindow(file, n.active);
    const district = districts.get(n.district);
    if (!district) errors.push(`${file}: district "${n.district}" not found in districts.yaml`);
    if (n.primarySector !== null) {
      if (!sectorIds.has(n.primarySector)) errors.push(`${file}: primarySector "${n.primarySector}" not found in sectors.yaml`);
      if (district && district.building !== 'town')
        errors.push(`${file}: primarySector is only allowed in districts whose building is "town"`);
    }
    checkUses(file, n.id, n.uses);
  }

  for (const c of data.customers) {
    const file = customerFile(c.id);
    if (nodeIds.has(c.id)) errors.push(`${file}: id "${c.id}" is also used by ${nodeFile(c.id)}`);
    c.sectors.forEach((s, i) => {
      if (!sectorIds.has(s)) errors.push(`${file}: sectors[${i}] "${s}" not found in sectors.yaml`);
    });
    if (c.type === 'segment' && !c.metric)
      warnings.push(`${file}: segment has no metric; add a sourced metric so its harbor shows how big it is`);
    checkUses(file, c.id, c.uses);
    checkWindow(file, c.active);
  }

  return { errors, warnings };
}
