/**
 * The color of a building's roofs, awnings and flags: the project's own brand color when the data has
 * one, otherwise the color of its sector (town buildings) or of its district.
 */
export function accentFor(
  node: { brand?: { color: string; source?: string }; primarySector?: string | null },
  districtColor: string,
  sectorColors: ReadonlyMap<string, string>,
): string {
  if (node.brand) return node.brand.color;
  return (node.primarySector && sectorColors.get(node.primarySector)) || districtColor;
}
