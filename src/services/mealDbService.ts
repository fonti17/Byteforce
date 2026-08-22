import type { Recipe, RecipeCourse, RecipeDiet, RecipeIngredient } from '../types/recipe';

export interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strDrinkAlternate: string | null;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string | null;
  strMealThumb: string | null;
  strTags: string | null;
  strYoutube: string | null;
  strIngredient1?: string | null;
  strIngredient2?: string | null;
  strIngredient3?: string | null;
  strIngredient4?: string | null;
  strIngredient5?: string | null;
  strIngredient6?: string | null;
  strIngredient7?: string | null;
  strIngredient8?: string | null;
  strIngredient9?: string | null;
  strIngredient10?: string | null;
  strIngredient11?: string | null;
  strIngredient12?: string | null;
  strIngredient13?: string | null;
  strIngredient14?: string | null;
  strIngredient15?: string | null;
  strIngredient16?: string | null;
  strIngredient17?: string | null;
  strIngredient18?: string | null;
  strIngredient19?: string | null;
  strIngredient20?: string | null;
  strMeasure1?: string | null;
  strMeasure2?: string | null;
  strMeasure3?: string | null;
  strMeasure4?: string | null;
  strMeasure5?: string | null;
  strMeasure6?: string | null;
  strMeasure7?: string | null;
  strMeasure8?: string | null;
  strMeasure9?: string | null;
  strMeasure10?: string | null;
  strMeasure11?: string | null;
  strMeasure12?: string | null;
  strMeasure13?: string | null;
  strMeasure14?: string | null;
  strMeasure15?: string | null;
  strMeasure16?: string | null;
  strMeasure17?: string | null;
  strMeasure18?: string | null;
  strMeasure19?: string | null;
  strMeasure20?: string | null;
  strSource?: string | null;
  strImageSource?: string | null;
  strCreativeCommonsConfirmed?: string | null;
  dateModified?: string | null;
}

export interface MealDbFilterItem {
  strMeal: string;
  strMealThumb: string;
  idMeal: string;
}

export interface MealDbCategoryItem {
  idCategory: string;
  strCategory: string;
  strCategoryThumb: string;
  strCategoryDescription: string;
}

export interface MealDbSearchResponse {
  meals: MealDbMeal[] | null;
}

export interface MealDbFilterResponse {
  meals: MealDbFilterItem[] | null;
}

export interface MealDbCategoryListResponse {
  meals: Array<{ strCategory: string }> | null;
}

export interface MealDbCategoriesResponse {
  categories: MealDbCategoryItem[] | null;
}

export class MealDbError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'MealDbError';
    this.status = status;
  }
}

/** Allowed catering schema units. */
const CATERING_UNITS_SET = new Set(['g', 'kg', 'ml', 'l', 'piece', 'pack']);

/** Unit alias mapping for measurement normalization. */
const UNIT_ALIASES: Record<string, { unit: string; factor: number }> = {
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
const UNICODE_FRACTIONS: Record<string, number> = {
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

/** Normalizes a raw unit string and scales the quantity. */
function normalizeMealDbUnit(
  quantity: number,
  rawUnit: string | null
): { quantity: number; unit: string } {
  const key = (rawUnit ?? '').trim().toLocaleLowerCase('de-CH').replace(/\.$/, '');
  if (key === '') return { quantity, unit: 'piece' };
  if (CATERING_UNITS_SET.has(key)) return { quantity, unit: key };
  const alias = UNIT_ALIASES[key];
  if (!alias) return { quantity, unit: 'piece' };
  return { quantity: quantity * alias.factor, unit: alias.unit };
}

/** Common stop words and German/English descriptive adjectives to strip when fuzzy matching dish names. */
const DISH_NAME_STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'with',
  'mit',
  'und',
  'de',
  'la',
  'le',
  'aus',
  'im',
  'in',
  'auf',
  'nach',
  'art',
  'style',
  'traditional',
  'traditionelles',
  'traditionelle',
  'classic',
  'klassisches',
  'klassische',
  'fresh',
  'frisches',
  'frische',
  'homemade',
  'hausgemachtes',
  'hausgemachte',
  'swiss',
  'schweizer',
  'delicious',
  'feines',
  'feine',
  'scharfes',
  'scharfe',
  'gebratenes',
  'gebratene',
  'gebackenes',
  'gebackene',
  'gekocht',
  'gekochte',
  'geröstet',
  'geröstete',
  'easy',
  'quick',
  'special',
  'best',
]);

/** Beverage keyword markers in German and English. */
const BEVERAGE_KEYWORDS = [
  'drink',
  'getränk',
  'getraenk',
  'cocktail',
  'mocktail',
  'wine',
  'wein',
  'beer',
  'bier',
  'cider',
  'juice',
  'saft',
  'lemonade',
  'limonade',
  'tea',
  'tee',
  'coffee',
  'kaffee',
  'espresso',
  'cappuccino',
  'punch',
  'punsch',
  'spritz',
  'water',
  'wasser',
  'smoothie',
  'shake',
  'aperitif',
  'apéro-getränk',
  'prosecco',
  'champagne',
  'champagner',
  'soda',
  'tonic',
  'sangria',
  'margarita',
  'mojito',
  'gin tonic',
];

/** Sauce, dressing, and condiment keyword markers in German and English. */
const SAUCE_KEYWORDS = [
  'sauce',
  'soße',
  'sosse',
  'dressing',
  'vinaigrette',
  'dip',
  'salsa',
  'gravy',
  'chutney',
  'mayonnaise',
  'mayo',
  'ketchup',
  'mustard',
  'senf',
  'pesto',
  'marinade',
  'coulis',
  'relish',
  'aioli',
  'guacamole',
  'hollandaise',
  'béarnaise',
  'bearnaise',
  'jus',
  'glaze',
  'fond',
  'tartar sauce',
  'tartarsauce',
  'tzatziki',
  'chimichurri',
  'hummus',
  'tapenade',
];

/**
 * Determines whether a dish or menu item is exempt from mandatory TheMealDB lookup.
 * Beverages and sauces/condiments are exempt and can be generated directly by AI.
 */
export function isExemptFromMealDb(
  item: { name?: string; course?: string | null; category?: string | null } | string
): { isExempt: boolean; type: 'beverage' | 'sauce' | null } {
  const name = (typeof item === 'string' ? item : item.name ?? '').trim().toLowerCase();
  const course = (typeof item === 'object' ? item.course ?? '' : '').trim().toLowerCase();
  const category = (typeof item === 'object' ? item.category ?? '' : '').trim().toLowerCase();

  if (course === 'drink' || category === 'drink' || category === 'beverage') {
    return { isExempt: true, type: 'beverage' };
  }

  for (const keyword of BEVERAGE_KEYWORDS) {
    if (name.includes(keyword)) {
      return { isExempt: true, type: 'beverage' };
    }
  }

  for (const keyword of SAUCE_KEYWORDS) {
    if (name.includes(keyword)) {
      return { isExempt: true, type: 'sauce' };
    }
  }

  return { isExempt: false, type: null };
}

/**
 * Parses free-form ingredient measure strings from TheMealDB (e.g. "3/4 cup", "200g", "2 tbsp", "1 tin", "pinch")
 * into normalized `{ quantity, unit, note }` compatible with the catering schema.
 */
export function parseMealDbMeasure(
  rawMeasure: string | null | undefined
): { quantity: number; unit: string; note: string | null } {
  if (!rawMeasure || !rawMeasure.trim()) {
    return { quantity: 1, unit: 'piece', note: null };
  }

  const text = rawMeasure.trim();
  const lower = text.toLowerCase();

  // Non-numeric qualifiers
  if (/^(to taste|nach geschmack|taste)$/i.test(lower)) {
    return { quantity: 1, unit: 'piece', note: 'to taste' };
  }
  if (/^a?\s*pinch(es)?$/i.test(lower)) {
    return { quantity: 1, unit: 'piece', note: 'pinch' };
  }
  if (/^a?\s*dash(es)?$/i.test(lower)) {
    return { quantity: 1, unit: 'piece', note: 'dash' };
  }
  if (/^a?\s*handful(s)?$/i.test(lower)) {
    return { quantity: 1, unit: 'piece', note: 'handful' };
  }
  if (/^(garnish|for garnish|for dusting|for serving|to serve)$/i.test(lower)) {
    return { quantity: 1, unit: 'piece', note: lower };
  }
  if (/^(drizzle|splash|generous amount|as needed|optional)$/i.test(lower)) {
    return { quantity: 1, unit: 'piece', note: lower };
  }

  let parsedQuantity: number | null = null;
  let remainingText = text;

  // 1. Mixed numbers: "1 1/2", "2 1/4", "1-1/2"
  const mixedMatch = text.match(/^(\d+)\s*[-/& ]\s*(\d+)\/(\d+)\s*(.*)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const num = Number(mixedMatch[2]);
    const den = Number(mixedMatch[3]);
    if (den !== 0) {
      parsedQuantity = whole + num / den;
      remainingText = mixedMatch[4];
    }
  }

  // 2. Simple fraction: "1/2", "3/4"
  if (parsedQuantity === null) {
    const fracMatch = text.match(/^(\d+)\/(\d+)\s*(.*)$/);
    if (fracMatch) {
      const num = Number(fracMatch[1]);
      const den = Number(fracMatch[2]);
      if (den !== 0) {
        parsedQuantity = num / den;
        remainingText = fracMatch[3];
      }
    }
  }

  // 3. Ranges: "1-2", "1 to 2", "2-3" -> take upper / average
  if (parsedQuantity === null) {
    const rangeMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*[-–to]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/i);
    if (rangeMatch) {
      const q1 = Number(rangeMatch[1].replace(',', '.'));
      const q2 = Number(rangeMatch[2].replace(',', '.'));
      parsedQuantity = Math.max(q1, q2);
      remainingText = rangeMatch[3];
    }
  }

  // 4. Unicode fractions: "1½", "½"
  if (parsedQuantity === null) {
    for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
      if (text.includes(char)) {
        const parts = text.split(char);
        const prefix = parts[0].trim();
        const whole = prefix ? Number(prefix) : 0;
        if (!Number.isNaN(whole)) {
          parsedQuantity = whole + val;
          remainingText = parts.slice(1).join(' ').trim();
          break;
        }
      }
    }
  }

  // 5. Standard decimal / integer with trailing unit: "200g", "1.5 kg", "2"
  if (parsedQuantity === null) {
    const standardMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (standardMatch) {
      parsedQuantity = Number(standardMatch[1].replace(',', '.'));
      remainingText = standardMatch[2];
    }
  }

  // If no leading number could be extracted, check for descriptive patterns:
  if (parsedQuantity === null || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
    const juiceMatch = text.match(/juice\s+of\s+(\d+)/i);
    if (juiceMatch) {
      return { quantity: Number(juiceMatch[1]), unit: 'piece', note: 'juice' };
    }
    const zestMatch = text.match(/zest\s+of\s+(\d+)/i);
    if (zestMatch) {
      return { quantity: Number(zestMatch[1]), unit: 'piece', note: 'zest' };
    }
    return { quantity: 1, unit: 'piece', note: text || null };
  }

  const rawUnitCandidate = remainingText.trim().toLowerCase();
  const cleanUnitCandidate = rawUnitCandidate.replace(/[().,]/g, '').trim();

  // Imperial weight & volume conversions
  if (/^oz(s)?\b|^ounce(s)?\b/i.test(cleanUnitCandidate)) {
    const inGrams = Math.round(parsedQuantity * 28.35);
    return { quantity: Math.max(1, inGrams), unit: 'g', note: null };
  }
  if (/^lb(s)?\b|^pound(s)?\b/i.test(cleanUnitCandidate)) {
    const inGrams = Math.round(parsedQuantity * 453.59);
    if (inGrams >= 1000) {
      return {
        quantity: Math.round((inGrams / 1000) * 100) / 100,
        unit: 'kg',
        note: null,
      };
    }
    return { quantity: inGrams, unit: 'g', note: null };
  }
  if (/^pint(s)?\b/i.test(cleanUnitCandidate)) {
    return { quantity: Math.round(parsedQuantity * 473), unit: 'ml', note: null };
  }

  const unitWord = cleanUnitCandidate.split(/\s+/)[0] || '';
  const normalized = normalizeMealDbUnit(parsedQuantity, unitWord);

  let note: string | null = null;
  if (normalized.unit === 'piece' && remainingText.trim()) {
    note = remainingText.trim();
  }

  return {
    quantity: roundQuantity(normalized.quantity, normalized.unit),
    unit: normalized.unit,
    note,
  };
}

function roundQuantity(quantity: number, unit: string): number {
  if (unit === 'piece' || unit === 'pack') return Math.max(1, Math.ceil(quantity));
  if (unit === 'kg' || unit === 'l') return Math.round(quantity * 100) / 100;
  return Math.round(quantity);
}

/**
 * Breaks down TheMealDB raw instructions into clean, discrete preparation steps.
 */
export function parseMealDbInstructions(instructionsText: string | null | undefined): string[] {
  if (!instructionsText || !instructionsText.trim()) return [];

  const rawParagraphs = instructionsText
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const steps: string[] = [];

  for (const para of rawParagraphs) {
    const numberedMatches = para.match(/(?:^|\s)(?:STEP\s+)?\d+[:.)]\s+/gi);
    if (numberedMatches && numberedMatches.length > 1) {
      const splitSteps = para
        .split(/(?:^|\s)(?:STEP\s+)?\d+[:.)]\s+/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      steps.push(...splitSteps);
    } else {
      const cleaned = para.replace(/^(?:STEP\s+)?\d+[:.)]\s*/i, '').trim();
      if (cleaned.length > 0) {
        steps.push(cleaned);
      }
    }
  }

  if (steps.length === 0 && instructionsText.trim().length > 0) {
    return instructionsText
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);
  }

  return steps;
}

/** Maps TheMealDB category to standard RecipeCourse. */
function mapMealDbCategoryToCourse(category: string | null | undefined): RecipeCourse {
  const cat = (category ?? '').trim().toLowerCase();
  if (cat === 'dessert') return 'dessert';
  if (cat === 'side') return 'side';
  if (cat === 'starter') return 'starter';
  if (cat === 'breakfast') return 'main';
  return 'main';
}

/** Maps TheMealDB category and tags to standard RecipeDiet flags. */
function mapMealDbDiet(meal: MealDbMeal): RecipeDiet[] {
  const diets = new Set<RecipeDiet>();
  const cat = (meal.strCategory ?? '').trim().toLowerCase();
  const tags = (meal.strTags ?? '').trim().toLowerCase();

  if (cat === 'vegan' || tags.includes('vegan')) {
    diets.add('vegan');
    diets.add('vegetarian');
  } else if (cat === 'vegetarian' || tags.includes('vegetarian')) {
    diets.add('vegetarian');
  }

  if (tags.includes('gluten-free') || tags.includes('gluten free')) {
    diets.add('gluten_free');
  }

  return [...diets];
}

/** Parses servings from meal instructions or returns the standard default yield (4). */
function parseServingsFromMeal(instructions: string | null | undefined, defaultServings = 4): number {
  if (!instructions) return defaultServings;
  const match = instructions.match(
    /(?:serves|servings|yields?|makes|für|portionen|personen)\s*:?\s*(\d{1,2})/iu
  );
  if (match) {
    const parsed = Number(match[1]);
    if (parsed >= 1 && parsed <= 50) return parsed;
  }
  return defaultServings;
}

/**
 * Hydrates a TheMealDB record into the application's domain `Recipe` model,
 * strictly extracting all ingredients, measures, and steps from the database.
 */
export function mealDbToRecipe(
  meal: MealDbMeal,
  options: { defaultServings?: number; course?: RecipeCourse } = {}
): Recipe {
  const ingredients: RecipeIngredient[] = [];

  for (let i = 1; i <= 20; i++) {
    const rawIng = (meal[`strIngredient${i}` as keyof MealDbMeal] as string | null | undefined)?.trim();
    const rawMeasure = (meal[`strMeasure${i}` as keyof MealDbMeal] as string | null | undefined)?.trim();

    if (rawIng && rawIng.length > 0) {
      const { quantity, unit, note } = parseMealDbMeasure(rawMeasure);
      ingredients.push({
        ingredient: rawIng,
        quantity,
        unit,
        category: null,
        note,
      });
    }
  }

  const steps = parseMealDbInstructions(meal.strInstructions);
  const servings = parseServingsFromMeal(meal.strInstructions, options.defaultServings ?? 4);
  const course = options.course ?? mapMealDbCategoryToCourse(meal.strCategory);
  const diet = mapMealDbDiet(meal);

  const descriptionParts: string[] = [];
  if (meal.strArea) descriptionParts.push(meal.strArea);
  if (meal.strCategory) descriptionParts.push(meal.strCategory);
  const description = descriptionParts.length > 0 ? descriptionParts.join(' • ') : null;

  return {
    name: meal.strMeal.trim(),
    description,
    servings,
    course,
    diet,
    ingredients,
    steps,
    source: meal.strSource || meal.strYoutube || 'TheMealDB',
  };
}

export class MealDbService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || 'https://www.themealdb.com/api/json/v1/1';
  }

  /**
   * Search meals by name in TheMealDB.
   * Endpoint: `https://www.themealdb.com/api/json/v1/1/search.php?s=...`
   */
  async searchByName(name: string, signal?: AbortSignal): Promise<MealDbMeal[]> {
    const trimmed = name.trim();
    if (!trimmed) return [];

    const url = `${this.baseUrl}/search.php?s=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new MealDbError(`TheMealDB search failed with HTTP ${response.status}`, response.status);
    }
    const data = (await response.json()) as MealDbSearchResponse;
    return Array.isArray(data.meals) ? data.meals : [];
  }

  /**
   * Lookup meal by TheMealDB ID.
   * Endpoint: `https://www.themealdb.com/api/json/v1/1/lookup.php?i=...`
   */
  async lookupById(id: string, signal?: AbortSignal): Promise<MealDbMeal | null> {
    const trimmed = id.trim();
    if (!trimmed) return null;

    const url = `${this.baseUrl}/lookup.php?i=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new MealDbError(`TheMealDB lookup failed with HTTP ${response.status}`, response.status);
    }
    const data = (await response.json()) as MealDbSearchResponse;
    return Array.isArray(data.meals) && data.meals.length > 0 ? data.meals[0] : null;
  }

  /**
   * Filter meals by TheMealDB Category.
   * Endpoint: `https://www.themealdb.com/api/json/v1/1/filter.php?c=...`
   */
  async filterByCategory(category: string, signal?: AbortSignal): Promise<MealDbFilterItem[]> {
    const trimmed = category.trim();
    if (!trimmed) return [];

    const url = `${this.baseUrl}/filter.php?c=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new MealDbError(`TheMealDB category filter failed with HTTP ${response.status}`, response.status);
    }
    const data = (await response.json()) as MealDbFilterResponse;
    return Array.isArray(data.meals) ? data.meals : [];
  }

  /**
   * Filter meals by main ingredient in TheMealDB.
   * Endpoint: `https://www.themealdb.com/api/json/v1/1/filter.php?i=...`
   */
  async filterByIngredient(ingredient: string, signal?: AbortSignal): Promise<MealDbFilterItem[]> {
    const trimmed = ingredient.trim();
    if (!trimmed) return [];

    const url = `${this.baseUrl}/filter.php?i=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new MealDbError(`TheMealDB ingredient filter failed with HTTP ${response.status}`, response.status);
    }
    const data = (await response.json()) as MealDbFilterResponse;
    return Array.isArray(data.meals) ? data.meals : [];
  }

  /**
   * List all valid categories in TheMealDB.
   * Endpoint: `https://www.themealdb.com/api/json/v1/1/list.php?c=list`
   */
  async listCategories(signal?: AbortSignal): Promise<string[]> {
    const url = `${this.baseUrl}/list.php?c=list`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new MealDbError(`TheMealDB categories list failed with HTTP ${response.status}`, response.status);
    }
    const data = (await response.json()) as MealDbCategoryListResponse;
    return Array.isArray(data.meals)
      ? data.meals.map((item) => item.strCategory).filter(Boolean)
      : [];
  }

  /**
   * Fetches a single random meal from TheMealDB.
   * Endpoint: `https://www.themealdb.com/api/json/v1/1/random.php`
   */
  async getRandomMeal(signal?: AbortSignal): Promise<MealDbMeal | null> {
    const url = `${this.baseUrl}/random.php`;
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new MealDbError(`TheMealDB random query failed with HTTP ${response.status}`, response.status);
    }
    const data = (await response.json()) as MealDbSearchResponse;
    return Array.isArray(data.meals) && data.meals.length > 0 ? data.meals[0] : null;
  }

  /**
   * Multi-strategy search algorithm to match a dish name against TheMealDB:
   * 1. Exact / substring match on full candidate name.
   * 2. Clean candidate name (strip non-alphanumeric and culinary stop words).
   * 3. Search individual keywords / alternative keywords.
   * 4. Query TheMealDB category filter fallback.
   */
  async findMatchingMeal(
    candidateName: string,
    options: {
      category?: string;
      course?: RecipeCourse;
      keywords?: string[];
      signal?: AbortSignal;
    } = {}
  ): Promise<MealDbMeal | null> {
    const trimmed = candidateName.trim();
    if (!trimmed) return null;

    // Strategy 1: Direct search with full candidate name
    const initialResults = await this.searchByName(trimmed, options.signal);
    if (initialResults.length > 0) {
      const lowerCandidate = trimmed.toLowerCase();
      // Look for exact match first
      const exact = initialResults.find((m) => m.strMeal.toLowerCase() === lowerCandidate);
      if (exact) return exact;

      // Look for substring match
      const sub = initialResults.find(
        (m) =>
          m.strMeal.toLowerCase().includes(lowerCandidate) ||
          lowerCandidate.includes(m.strMeal.toLowerCase())
      );
      if (sub) return sub;

      return initialResults[0];
    }

    // Strategy 2: Clean candidate name and try individual core keywords
    const tokens = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !DISH_NAME_STOP_WORDS.has(w));

    for (const token of tokens) {
      const tokenResults = await this.searchByName(token, options.signal);
      if (tokenResults.length > 0) {
        return tokenResults[0];
      }
    }

    // Strategy 3: Try explicit alternative keywords if provided
    if (options.keywords && options.keywords.length > 0) {
      for (const kw of options.keywords) {
        const kwTrimmed = kw.trim();
        if (kwTrimmed) {
          const kwResults = await this.searchByName(kwTrimmed, options.signal);
          if (kwResults.length > 0) {
            return kwResults[0];
          }
        }
      }
    }

    // Strategy 4: Fallback to TheMealDB category query
    const targetCategory = options.category || (options.course ? mapCourseToMealDbCategory(options.course) : null);
    if (targetCategory) {
      const categoryItems = await this.filterByCategory(targetCategory, options.signal);
      if (categoryItems.length > 0) {
        // Fetch full details of the first category item
        const fullDetails = await this.lookupById(categoryItems[0].idMeal, options.signal);
        if (fullDetails) return fullDetails;
      }
    }

    return null;
  }
}

function mapCourseToMealDbCategory(course: RecipeCourse): string {
  switch (course) {
    case 'dessert': return 'Dessert';
    case 'side': return 'Side';
    case 'starter': return 'Starter';
    default: return 'Miscellaneous';
  }
}

export const mealDbService = new MealDbService();
