import recipeConfig from './recipe.config.json';
import { extractJsonObject } from '@/shared/utils/json';
import { llmService } from '@/shared/llm/llmService';
import { CATERING_UNITS } from '@/features/catering-plan/types';
import type {
  CateringMenuItem,
  CateringPlan,
  ShoppingListEntry,
} from '@/features/catering-plan/types';
import type { GatheringResult } from '@/features/gathering/types';
import type {
  Recipe,
  RecipeCourse,
  RecipeDiet,
  RecipeField,
  RecipeIngredient,
  RecipeOptions,
  RecipeTurn,
  StoredRecipe,
} from './types';
import { RECIPE_COURSES, RECIPE_DIETS, RECIPE_REQUIRED_FIELDS } from './types';
import type { LLMResponse } from '@/shared/llm/types';

export class RecipeError extends Error {
  /** Raw model answer, kept so a failed import can be inspected. */
  content?: string;

  constructor(message: string, content?: string) {
    super(message);
    this.name = 'RecipeError';
    this.content = content;
  }
}

const UNITS = new Set<string>(CATERING_UNITS);
const COURSES = new Set<string>(RECIPE_COURSES);
const DIETS = new Set<string>(RECIPE_DIETS);

/**
 * Written units mapped onto the schema enum. Kitchen measures are converted to
 * a volume, because the shopping list only carries the six schema units.
 */
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
  tl: { unit: 'ml', factor: 5 },
  teelöffel: { unit: 'ml', factor: 5 },
  tsp: { unit: 'ml', factor: 5 },
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
};

/** Unicode fractions, common in pasted recipes. */
const FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅛': 0.125,
};

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value.replace(/[\s']/g, '').replace(',', '.')) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** Maps a written unit onto the schema enum, returning the converted quantity. */
function normalizeUnit(
  quantity: number,
  rawUnit: string | null
): { quantity: number; unit: string } {
  const key = (rawUnit ?? '').trim().toLocaleLowerCase('de-CH').replace(/\.$/, '');
  if (key === '') return { quantity, unit: 'piece' };
  if (UNITS.has(key)) return { quantity, unit: key };
  const alias = UNIT_ALIASES[key];
  if (!alias) return { quantity, unit: 'piece' };
  return { quantity: quantity * alias.factor, unit: alias.unit };
}

/** Keeps quantities readable: whole counts, sensible decimals for weights. */
function roundQuantity(quantity: number, unit: string): number {
  if (unit === 'piece' || unit === 'pack') return Math.max(1, Math.ceil(quantity));
  if (unit === 'kg' || unit === 'l') return Math.round(quantity * 100) / 100;
  return Math.round(quantity);
}

function parseIngredients(value: unknown): RecipeIngredient[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const ingredient = asText(record.ingredient) ?? asText(record.name);
    const rawQuantity = asNumber(record.quantity);
    if (ingredient === null || rawQuantity === null || rawQuantity <= 0) return [];
    const { quantity, unit } = normalizeUnit(rawQuantity, asText(record.unit));
    return [
      {
        ingredient,
        quantity: roundQuantity(quantity, unit),
        unit,
        category: asText(record.category),
        note: asText(record.note),
      },
    ];
  });
}

function parseSteps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const step = asText(entry);
    return step === null ? [] : [step];
  });
}

function parseDiet(value: unknown): RecipeDiet[] {
  if (!Array.isArray(value)) return [];
  const diets = value.flatMap((entry) => {
    const diet = asText(entry)?.toLowerCase().replace(/[\s-]/g, '_');
    return diet && DIETS.has(diet) ? [diet as RecipeDiet] : [];
  });
  return [...new Set(diets)];
}

function parseCourse(value: unknown): RecipeCourse | null {
  const course = asText(value)?.toLowerCase();
  return course && COURSES.has(course) ? (course as RecipeCourse) : null;
}

/**
 * Reads a model answer into the shape of `recipe.config.json`. Unusable
 * ingredient rows are dropped; a recipe without any usable ingredient is an
 * error, because it cannot contribute to a shopping list.
 */
export function parseRecipe(content: string, fallbackName = ''): Recipe {
  const parsed = extractJsonObject(content);
  if (!parsed) throw new RecipeError('The recipe response contained no JSON object.', content);

  const ingredients = parseIngredients(parsed.ingredients);
  if (ingredients.length === 0) {
    throw new RecipeError('The recipe response held no usable ingredients.', content);
  }

  // A missing serving count stays missing: the app asks for it rather than
  // scaling the event quantities off a guessed number.
  const servings = asNumber(parsed.servings);
  return {
    name: asText(parsed.name) ?? fallbackName,
    description: asText(parsed.description),
    servings: servings !== null && servings >= 1 ? Math.round(servings) : null,
    course: parseCourse(parsed.course),
    diet: parseDiet(parsed.diet),
    ingredients,
    steps: parseSteps(parsed.steps),
    source: asText(parsed.source),
  };
}

/* -------------------------------------------------------------------------- */
/* Deterministic fallback parser                                              */
/* -------------------------------------------------------------------------- */

const INGREDIENT_LINE =
  /^[-*•\s]*((?:\d+[.,]?\d*)|[½⅓⅔¼¾⅛])\s*([a-zA-Zäöüß]{1,12}\.?)?\s+(.{2,})$/u;

/** "1." / "2)" in front of a line — a numbered step unless a quantity follows. */
const NUMBERED_LINE = /^\d{1,2}[.)]\s+(.*)$/u;

/** "Tomatensalat für 6 Personen" — the count belongs to servings, not the name. */
const SERVINGS_SUFFIX =
  /[,–-]?\s*(?:für\s+|for\s+|serves\s+)?\d{1,3}\s*(?:personen|portionen|servings|people|guests)\s*$/iu;

const INGREDIENT_HEADING = /^(zutaten|ingredients)\s*:?\s*$/iu;
const STEP_HEADING =
  /^(zubereitung|preparation|instructions|anleitung|schritte|steps|method)\s*:?\s*$/iu;

function parseAmount(raw: string): number | null {
  if (FRACTIONS[raw] !== undefined) return FRACTIONS[raw];
  return asNumber(raw);
}

function parseServings(text: string): number | null {
  const match = text.match(
    /(?:für\s+)?(\d{1,3})\s*(?:personen|pers\.?|portionen|port\.|servings|serves|people|guests|gäste|gaeste)/iu
  );
  const fromLabel = match ? Number(match[1]) : null;
  if (fromLabel && fromLabel >= 1) return fromLabel;
  // "Serves 8", "Portionen: 4" — the same statement the other way round.
  const reversed = text.match(
    /(?:serves|servings|portionen|personen|portions)\s*:?\s*(\d{1,3})/iu
  );
  const fromReversed = reversed ? Number(reversed[1]) : null;
  return fromReversed && fromReversed >= 1 ? fromReversed : null;
}

/**
 * Deterministic safety net for pasted recipes. Apertus remains the primary
 * converter, but an unreachable model must not block saving a recipe — the same
 * arrangement the gathering step uses.
 */
export function extractRecipeLocally(text: string): Recipe | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return null;

  const ingredients: RecipeIngredient[] = [];
  const steps: string[] = [];
  let name = '';
  // Pasted recipes run title → ingredients → preparation; a heading moves the
  // reader on, and the first quantity line does so too when headings are absent.
  let section: 'head' | 'ingredients' | 'steps' = 'head';

  for (const line of lines) {
    if (INGREDIENT_HEADING.test(line)) {
      section = 'ingredients';
      continue;
    }
    if (STEP_HEADING.test(line)) {
      section = 'steps';
      continue;
    }

    // A numbered line is a step unless a quantity follows the marker, which is
    // how "1. 200 g Mehl" and "1. Mehl unterrühren" tell themselves apart.
    const numbered = line.match(NUMBERED_LINE);
    const body = numbered ? numbered[1] : line;

    if (section !== 'steps') {
      const match = body.match(INGREDIENT_LINE);
      const amount = match ? parseAmount(match[1]) : null;
      if (match && amount !== null && amount > 0) {
        const { quantity, unit } = normalizeUnit(amount, match[2] ?? null);
        ingredients.push({
          ingredient: match[3].trim().replace(/\s{2,}/g, ' '),
          quantity: roundQuantity(quantity, unit),
          unit,
          category: null,
          note: null,
        });
        section = 'ingredients';
        continue;
      }
    }

    if (section === 'head' && name === '' && !/^(rezept|recipe)\s*:?\s*$/i.test(line)) {
      name = line.replace(/^(rezept|recipe)\s*:\s*/i, '').replace(SERVINGS_SUFFIX, '').trim();
    } else if (section !== 'head' && body.length > 12) {
      // Prose between or after the ingredients is preparation, not a title.
      steps.push(body);
      if (numbered) section = 'steps';
    }
  }

  if (ingredients.length === 0) return null;

  return {
    // An unnamed recipe is left unnamed, so the app can ask for the name
    // instead of storing a placeholder.
    name,
    description: null,
    servings: parseServings(text),
    course: null,
    diet: [],
    ingredients,
    steps,
    source: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Missing values                                                             */
/* -------------------------------------------------------------------------- */

function hasRecipeValue(recipe: Recipe, field: RecipeField): boolean {
  switch (field) {
    case 'name': return recipe.name.trim() !== '';
    case 'servings': return recipe.servings !== null && recipe.servings >= 1;
    case 'ingredients': return recipe.ingredients.length > 0;
  }
}

/**
 * Required properties of `recipe.config.json` the read did not produce.
 * The counterpart of `getMissingRequiredFields` in the gathering step: the app
 * asks for these instead of filling them in with a guess.
 */
export function getMissingRecipeFields(recipe: Recipe): RecipeField[] {
  return RECIPE_REQUIRED_FIELDS.filter((field) => !hasRecipeValue(recipe, field));
}

/** True once the recipe validates against the schema and can be scaled. */
export function isRecipeComplete(recipe: Recipe): boolean {
  return getMissingRecipeFields(recipe).length === 0;
}

/* -------------------------------------------------------------------------- */
/* Scaling and merging into the catering plan shape                           */
/* -------------------------------------------------------------------------- */

/** g and ml are the base units, so kg/l entries can be summed with them. */
function toBase(quantity: number, unit: string): { quantity: number; unit: string } {
  if (unit === 'kg') return { quantity: quantity * 1000, unit: 'g' };
  if (unit === 'l') return { quantity: quantity * 1000, unit: 'ml' };
  return { quantity, unit };
}

/** Presents a summed base quantity in the larger unit once it gets big. */
function fromBase(quantity: number, unit: string): { quantity: number; unit: string } {
  if (unit === 'g' && quantity >= 1000) return { quantity: quantity / 1000, unit: 'kg' };
  if (unit === 'ml' && quantity >= 1000) return { quantity: quantity / 1000, unit: 'l' };
  return { quantity, unit };
}

function mergeKey(ingredient: string, unit: string): string {
  return `${ingredient.trim().toLocaleLowerCase('de-CH')}|${toBase(1, unit).unit}`;
}

/**
 * Sums entries that name the same ingredient in a compatible unit, so a recipe
 * used twice — or an ingredient the model also proposed — appears once.
 */
function mergeShoppingList(entries: ShoppingListEntry[]): ShoppingListEntry[] {
  const merged = new Map<string, ShoppingListEntry & { base: number; baseUnit: string }>();

  for (const entry of entries) {
    const key = mergeKey(entry.ingredient, entry.unit);
    const base = toBase(entry.quantity, entry.unit);
    const existing = merged.get(key);
    if (existing) {
      existing.base += base.quantity;
      existing.category = existing.category ?? entry.category;
    } else {
      merged.set(key, { ...entry, base: base.quantity, baseUnit: base.unit });
    }
  }

  return [...merged.values()].map(({ base, baseUnit, ...entry }) => {
    const presented = fromBase(base, baseUnit);
    return {
      ingredient: entry.ingredient,
      quantity: roundQuantity(presented.quantity, presented.unit),
      unit: presented.unit,
      category: entry.category,
    };
  });
}

/**
 * One recipe scaled from its own servings to the number of participants. A
 * recipe whose servings are still open cannot be scaled, so its quantities are
 * passed through unchanged; the planner only ever uses answered recipes.
 */
export function scaleRecipe(recipe: Recipe, participantCount: number): ShoppingListEntry[] {
  const factor = recipe.servings === null ? 1 : participantCount / Math.max(recipe.servings, 1);
  return recipe.ingredients.map((ingredient) => {
    const base = toBase(ingredient.quantity * factor, ingredient.unit);
    const presented = fromBase(base.quantity, base.unit);
    return {
      ingredient: ingredient.ingredient,
      quantity: roundQuantity(presented.quantity, presented.unit),
      unit: presented.unit,
      category: ingredient.category,
    };
  });
}

export interface RecipeContribution {
  menuItems: CateringMenuItem[];
  shoppingList: ShoppingListEntry[];
}

/** What the chosen recipes contribute to a plan, calculated rather than guessed. */
export function recipeContribution(
  recipes: Recipe[],
  participantCount: number
): RecipeContribution {
  return {
    menuItems: recipes.map((recipe) => ({
      name: recipe.name,
      description: recipe.description,
    })),
    shoppingList: mergeShoppingList(
      recipes.flatMap((recipe) => scaleRecipe(recipe, participantCount))
    ),
  };
}

/**
 * Folds the chosen recipes into a model-generated plan. Recipe quantities are
 * authoritative; anything the model added on top is merged in beside them.
 */
export function mergeRecipesIntoPlan(
  plan: CateringPlan,
  recipes: Recipe[],
  participantCount: number
): CateringPlan {
  if (recipes.length === 0) return plan;
  const contribution = recipeContribution(recipes, participantCount);
  const recipeNames = new Set(contribution.menuItems.map((item) => item.name.toLowerCase()));

  return {
    menu: {
      name: plan.menu.name,
      items: [
        ...contribution.menuItems,
        ...plan.menu.items.filter((item) => !recipeNames.has(item.name.toLowerCase())),
      ],
    },
    shoppingList: mergeShoppingList([...contribution.shoppingList, ...plan.shoppingList]),
  };
}

/**
 * Plan built from recipes alone. Used when the model is unreachable: the menu
 * and the quantities are known locally, only the cost estimate is not.
 */
export function buildPlanFromRecipes(recipes: Recipe[], result: GatheringResult): CateringPlan {
  const contribution = recipeContribution(recipes, result.participantCount);
  const title = recipes.map((r) => r.name).join(' & ');
  return {
    menu: { name: title, items: contribution.menuItems },
    shoppingList: contribution.shoppingList,
  };
}

/** A blank recipe in schema shape, for the manual editor. */
export function emptyRecipe(): Recipe {
  return {
    name: '',
    description: null,
    servings: null,
    course: null,
    diet: [],
    ingredients: [],
    steps: [],
    source: null,
  };
}

function createRecipeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function toStoredRecipe(recipe: Recipe, existing?: StoredRecipe): StoredRecipe {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? createRecipeId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    recipe,
  };
}

/* -------------------------------------------------------------------------- */
/* Model conversion                                                           */
/* -------------------------------------------------------------------------- */

function buildSystemPrompt(language: RecipeOptions['language']): string {
  return [
    'You convert a recipe (provided as recipe text, web link/URL, or dish title) into structured data.',
    '',
    'Return only one valid JSON object that conforms exactly to this JSON Schema:',
    JSON.stringify(recipeConfig),
    '',
    'Rules:',
    '- If detailed recipe text is provided, extract all information faithfully.',
    '- If a recipe URL/link or dish title is provided, generate the standard authentic ingredients and steps for that dish.',
    '- Only use canonical ingredient names.',
    '- servings is the number of people the listed quantities are for (e.g. 4). If not explicitly stated, use 4.',
    '- Convert every amount to one of the schema units: g, kg, ml, l, piece, pack.',
    '- Convert kitchen measures: 1 tablespoon/EL = 15 ml, 1 teaspoon/TL = 5 ml, 1 cup/Tasse = 250 ml, 1 dl = 100 ml.',
    '- Count-based items (eggs, onions, cloves of garlic, bunches, buns, sausages) use unit "piece".',
    '- Amounts stay as written for the stated servings. Do not scale them.',
    '- Set category to a shopping category such as vegetables, dairy, meat, bakery, canned, sauces, or dry goods.',
    '- Set diet flags only when the ingredient list clearly supports them.',
    '',
    language === 'en'
      ? 'Write all human-readable values in English.'
      : 'Write all human-readable values in German.',
    'Do not wrap the JSON in markdown code fences. Do not add prose.',
  ].join('\n');
}

export const recipeService = {
  async create(recipeText: string, options: RecipeOptions = {}): Promise<LLMResponse> {
    const { language, ...requestOptions } = options;
    return llmService.chat(
      [
        {
          role: 'user',
          content: [
            language === 'en'
              ? 'Convert this recipe into the schema:'
              : 'Wandle dieses Rezept in das Schema um:',
            recipeText.trim(),
          ].join('\n\n'),
        },
      ],
      {
        ...requestOptions,
        model: options.model ?? 'apertus-70b',
        temperature: options.temperature ?? 0.1,
        maxTokens: options.maxTokens ?? 1600,
        systemPrompt: buildSystemPrompt(language),
      }
    );
  },

  /** One request, parsed into the shape of `recipe.config.json`. */
  async convert(recipeText: string, options: RecipeOptions = {}): Promise<RecipeTurn> {
    const text = recipeText.trim();
    if (!text) throw new RecipeError('A recipe text is required.');
    const response = await this.create(text, options);
    return { recipe: parseRecipe(response.content), response };
  },
};
