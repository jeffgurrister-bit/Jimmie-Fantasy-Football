/**
 * Division marks, from the logos embedded in the League History sheet.
 *
 * Only 2016 and 2023 onward had divisions at all — 2017 to 2022 had none — so
 * these appear on those season pages and nowhere else. The 2016 pair (Biscuits,
 * Gravy) have no logo of their own in the sheet; only the three modern divisions
 * were drawn.
 */
const MARKS: Record<string, string> = {
  'Bun Spreaders': '/logos/bun-spreaders.png',
  'Burnt Biscuits': '/logos/burnt-biscuits.png',
  'Gravy Goons': '/logos/gravy-goons.png',
};

export function divisionLogo(name: string | null | undefined): string | undefined {
  return name ? MARKS[name] : undefined;
}
