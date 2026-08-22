/** Units allowed by `config/cateringPlanConfig.json`. */
export const CATERING_UNITS = ['g', 'kg', 'ml', 'l', 'piece', 'pack'] as const;
export type CateringUnit = (typeof CATERING_UNITS)[number];

export const CATERING_UNITS_SET = new Set<string>(CATERING_UNITS);

/**
 * Written units mapped onto the schema enum. Kitchen measures are converted to
 * a volume or weight, because the shopping list only carries the six schema units.
 */
export const UNIT_ALIASES: Readonly<Record<string, { unit: CateringUnit; factor: number }>> = {
  g: { unit: 'g', factor: 1 },
  gr: { unit: 'g', factor: 1 },
  gramm: { unit: 'g', factor: 1 },
  gram: { unit: 'g', factor: 1 },
  grams: { unit: 'g', factor: 1 },
  kg: { unit: 'kg', factor: 1 },
  kilo: { unit: 'kg', factor: 1 },
  kilogramm: { unit: 'kg', factor: 1 },
  pfund: { unit: 'g', factor: 500 },
  ml: { unit: 'ml', factor: 1 },
  milliliter: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'l', factor: 1 },
  liter: { unit: 'l', factor: 1 },
  litre: { unit: 'l', factor: 1 },
  el: { unit: 'ml', factor: 15 },
  esslöffel: { unit: 'ml', factor: 15 },
  tbsp: { unit: 'ml', factor: 15 },
  tablespoon: { unit: 'ml', factor: 15 },
  tablespoons: { unit: 'ml', factor: 15 },
  tblsp: { unit: 'ml', factor: 15 },
  tbsps: { unit: 'ml', factor: 15 },
  tl: { unit: 'ml', factor: 5 },
  teelöffel: { unit: 'ml', factor: 5 },
  tsp: { unit: 'ml', factor: 5 },
  teaspoon: { unit: 'ml', factor: 5 },
  teaspoons: { unit: 'ml', factor: 5 },
  tsps: { unit: 'ml', factor: 5 },
  tasse: { unit: 'ml', factor: 250 },
  tassen: { unit: 'ml', factor: 250 },
  cup: { unit: 'ml', factor: 250 },
  cups: { unit: 'ml', factor: 250 },
  stück: { unit: 'piece', factor: 1 },
  stk: { unit: 'piece', factor: 1 },
  piece: { unit: 'piece', factor: 1 },
  pieces: { unit: 'piece', factor: 1 },
  pcs: { unit: 'piece', factor: 1 },
  zehe: { unit: 'piece', factor: 1 },
  zehen: { unit: 'piece', factor: 1 },
  bund: { unit: 'piece', factor: 1 },
  scheibe: { unit: 'piece', factor: 1 },
  scheiben: { unit: 'piece', factor: 1 },
  clove: { unit: 'piece', factor: 1 },
  cloves: { unit: 'piece', factor: 1 },
  pack: { unit: 'pack', factor: 1 },
  packung: { unit: 'pack', factor: 1 },
  packungen: { unit: 'pack', factor: 1 },
  päckchen: { unit: 'pack', factor: 1 },
  dose: { unit: 'pack', factor: 1 },
  dosen: { unit: 'pack', factor: 1 },
  can: { unit: 'pack', factor: 1 },
  cans: { unit: 'pack', factor: 1 },
  tin: { unit: 'pack', factor: 1 },
  tins: { unit: 'pack', factor: 1 },
  package: { unit: 'pack', factor: 1 },
  packages: { unit: 'pack', factor: 1 },
};

/** Unicode fractions, common in recipe measurements. */
export const UNICODE_FRACTIONS: Readonly<Record<string, number>> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/** Maps a written unit onto the schema enum, returning the converted quantity. */
export function normalizeUnit(
  quantity: number,
  rawUnit: string | null
): { quantity: number; unit: CateringUnit } {
  const key = (rawUnit ?? '').trim().toLocaleLowerCase('de-CH').replace(/\.$/, '');
  if (key === '') return { quantity, unit: 'piece' };
  if (CATERING_UNITS_SET.has(key)) return { quantity, unit: key as CateringUnit };
  const alias = UNIT_ALIASES[key];
  if (!alias) return { quantity, unit: 'piece' };
  return { quantity: quantity * alias.factor, unit: alias.unit };
}

/** Keeps quantities readable: whole counts, sensible decimals for weights. */
export function roundQuantity(quantity: number, unit: string): number {
  if (unit === 'piece' || unit === 'pack') return Math.max(1, Math.ceil(quantity));
  if (unit === 'kg' || unit === 'l') return Math.round(quantity * 100) / 100;
  return Math.round(quantity);
}
