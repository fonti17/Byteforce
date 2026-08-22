import recipeConfig from '../../config/recipeConfig.json' with { type: 'json' };
import { extractJsonObject } from '../lib/json.ts';
import { normalizeUnit, roundQuantity, UNICODE_FRACTIONS } from '../lib/units.ts';
import { llmService } from './llmService.ts';
import {
  isExemptFromMealDb,
  mealDbService,
  mealDbToRecipe,
  parseMealDbInstructions,
  parseMealDbMeasure,
  type MealDbMeal,
} from './mealDbService.ts';
import type {
  CateringMenuItem,
  CateringPlan,
  ShoppingListEntry,
} from '../types/cateringPlan';
import type { GatheringResult } from '../types/gathering';
import type {
  Recipe,
  RecipeCourse,
  RecipeDiet,
  RecipeField,
  RecipeIngredient,
  RecipeOptions,
  RecipeTurn,
  StoredRecipe,
} from '../types/recipe';
import { RECIPE_COURSES, RECIPE_DIETS, RECIPE_REQUIRED_FIELDS } from '../types/recipe.ts';
import type { LLMResponse } from '../types/llm';

export {
  isExemptFromMealDb,
  mealDbService,
  mealDbToRecipe,
  normalizeUnit,
  parseMealDbInstructions,
  parseMealDbMeasure,
  roundQuantity,
};

export class RecipeError extends Error {
  /** Raw model answer, kept so a failed import can be inspected. */
  content?: string;

  constructor(message: string, content?: string) {
    super(message);
    this.name = 'RecipeError';
    this.content = content;
  }
}

const COURSES = new Set<string>(RECIPE_COURSES);
const DIETS = new Set<string>(RECIPE_DIETS);

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value.replace(/[\s']/g, '').replace(',', '.')) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
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
 * Reads a model answer into the shape of `config/recipeConfig.json`. Unusable
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
  if (UNICODE_FRACTIONS[raw] !== undefined) return UNICODE_FRACTIONS[raw];
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

/**
 * Keeps only a serving count the pasted text actually states. The model answers
 * with a plausible number even where the source names none, so its value is
 * believed only when the deterministic reader finds the same statement — the
 * arrangement part 1 uses for the fields most prone to invention.
 */
export function withStatedServings(recipe: Recipe, sourceText: string): Recipe {
  const stated = parseServings(sourceText);
  return stated === recipe.servings ? recipe : { ...recipe, servings: stated };
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
 * Required properties of `config/recipeConfig.json` the read did not produce.
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
export function mergeShoppingList(entries: ShoppingListEntry[]): ShoppingListEntry[] {
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
  return {
    menu: { name: '', items: contribution.menuItems },
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

export function createRecipeId(): string {
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
/* Model conversion & TheMealDB Integration                                    */
/* -------------------------------------------------------------------------- */

function buildSystemPrompt(language: RecipeOptions['language']): string {
  return [
    'You convert a pasted recipe into structured data.',
    '',
    'Return only one valid JSON object that conforms exactly to this JSON Schema:',
    JSON.stringify(recipeConfig),
    '',
    'Rules:',
    '- Use only information contained in the pasted text. Never invent ingredients or steps.',
    '- servings is the number of people the listed quantities are for. Use null if the text does not say it. Never guess a number.',
    '- Convert every amount to one of the schema units: g, kg, ml, l, piece, pack.',
    '- Convert kitchen measures: 1 tablespoon/EL = 15 ml, 1 teaspoon/TL = 5 ml, 1 cup/Tasse = 250 ml, 1 dl = 100 ml.',
    '- Count-based items (eggs, onions, cloves of garlic, bunches) use unit "piece".',
    '- Amounts stay as written for the stated servings. Do not scale them.',
    '- Set category to a shopping category such as vegetables, dairy, meat, or dry goods.',
    '- Set diet flags only when the ingredient list clearly supports them.',
    '',
    language === 'en'
      ? 'Write all human-readable values in English.'
      : 'Write all human-readable values in German.',
    'Do not wrap the JSON in markdown code fences. Do not add prose.',
  ].join('\n');
}

function buildBeverageSaucePrompt(name: string, language: RecipeOptions['language']): string {
  return [
    'You are a professional chef. Generate a high-quality recipe for this beverage, cocktail, sauce, or condiment:',
    `Item: "${name}"`,
    '',
    'Return only one valid JSON object conforming exactly to this JSON Schema:',
    JSON.stringify(recipeConfig),
    '',
    'Rules:',
    '- Provide realistic ingredient quantities for 4 standard servings (servings: 4).',
    '- Convert every ingredient amount to one of the schema units: g, kg, ml, l, piece, pack.',
    '- Set course to "drink" for beverages/cocktails, or "side"/"starter" for sauces/condiments.',
    '- Set source to "AI (Direct Generation)".',
    '',
    language === 'en'
      ? 'Write all human-readable values in English.'
      : 'Write all human-readable values in German.',
    'Do not wrap the JSON in markdown code fences. Do not add prose.',
  ].join('\n');
}

export interface ResolvedMealRecipeResult {
  recipe: Recipe;
  isFromMealDb: boolean;
  mealDbRaw?: MealDbMeal;
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

  /** One request, parsed into the shape of `config/recipeConfig.json`. */
  async convert(recipeText: string, options: RecipeOptions = {}): Promise<RecipeTurn> {
    const text = recipeText.trim();
    if (!text) throw new RecipeError('A recipe text is required.');
    const response = await this.create(text, options);
    return { recipe: withStatedServings(parseRecipe(response.content), text), response };
  },

  /**
   * Search TheMealDB for food recipes matching query and return hydrated Recipe models.
   */
  async lookupMealDb(query: string, options: { signal?: AbortSignal } = {}): Promise<Recipe[]> {
    const meals = await mealDbService.searchByName(query, options.signal);
    return meals.map((meal) => mealDbToRecipe(meal));
  },

  /**
   * Directly generates beverage or sauce recipes via AI without requiring TheMealDB lookup (R3).
   */
  async createBeverageOrSauce(
    name: string,
    options: RecipeOptions = {}
  ): Promise<Recipe> {
    const { language = 'de', ...requestOptions } = options;
    const prompt = buildBeverageSaucePrompt(name, language);

    try {
      const response = await llmService.chat(
        [{ role: 'user', content: `Generate recipe for: ${name}` }],
        {
          ...requestOptions,
          model: options.model ?? 'apertus-70b',
          temperature: options.temperature ?? 0.2,
          maxTokens: options.maxTokens ?? 1200,
          systemPrompt: prompt,
        }
      );

      const parsed = parseRecipe(response.content, name);
      return {
        ...parsed,
        source: parsed.source || 'AI (Direct Generation)',
      };
    } catch {
      const isDrink = isExemptFromMealDb(name).type === 'beverage';
      return {
        name,
        description: null,
        servings: 4,
        course: isDrink ? 'drink' : 'side',
        diet: [],
        ingredients: [
          {
            ingredient: name,
            quantity: isDrink ? 1 : 200,
            unit: isDrink ? 'l' : 'g',
            category: isDrink ? 'drinks' : 'condiments',
            note: null,
          },
        ],
        steps: [`Prepare and serve ${name}.`],
        source: 'AI (Direct Generation)',
      };
    }
  },

  /**
   * Resolves a dish candidate according to requirements:
   * - Beverages and sauces are generated directly by AI (R3).
   * - Food dishes are strictly looked up in TheMealDB, with automatic retry strategies (R1, R2).
   */
  async resolveMealRecipe(
    candidateName: string,
    options: {
      course?: RecipeCourse;
      category?: string;
      keywords?: string[];
      signal?: AbortSignal;
      language?: 'de' | 'en';
      retryWithAi?: boolean;
    } = {}
  ): Promise<ResolvedMealRecipeResult> {
    const trimmed = candidateName.trim();
    if (!trimmed) throw new RecipeError('Candidate name cannot be empty.');

    const exemption = isExemptFromMealDb({ name: trimmed, course: options.course });
    if (exemption.isExempt) {
      const recipe = await this.createBeverageOrSauce(trimmed, {
        language: options.language,
        signal: options.signal,
      });
      return { recipe, isFromMealDb: false };
    }

    // Step 1: Query TheMealDB directly with candidate name & search strategies
    const match = await mealDbService.findMatchingMeal(trimmed, {
      category: options.category,
      course: options.course,
      keywords: options.keywords,
      signal: options.signal,
    });

    if (match) {
      return {
        recipe: mealDbToRecipe(match, { course: options.course }),
        isFromMealDb: true,
        mealDbRaw: match,
      };
    }

    // Step 2: Automatic retry - ask AI for 3 alternative English database candidate names
    if (options.retryWithAi !== false) {
      try {
        const aiRetryResponse = await llmService.chat(
          [
            {
              role: 'user',
              content: [
                `Suggest 3 alternative standard English dish names that exist in recipe databases like TheMealDB for: "${trimmed}".`,
                `Course: ${options.course ?? 'main'}.`,
                'IMPORTANT: The dish names must strictly be in English (TheMealDB is in English).',
                'Return only a JSON object with key "alternatives" containing an array of 3 English dish name strings, e.g. {"alternatives": ["Chicken Curry", "Chicken Tikka Masala", "Butter Chicken"]}.',
              ].join('\n'),
            },
          ],
          {
            model: 'apertus-8b',
            temperature: 0.1,
            maxTokens: 200,
            signal: options.signal,
          }
        );

        const parsedObj = extractJsonObject(aiRetryResponse.content);
        const candidates: string[] = Array.isArray(parsedObj?.alternatives)
          ? (parsedObj!.alternatives as string[])
          : [];

        for (const altName of candidates) {
          if (typeof altName === 'string' && altName.trim()) {
            const altMatch = await mealDbService.findMatchingMeal(altName.trim(), {
              category: options.category,
              course: options.course,
              signal: options.signal,
            });
            if (altMatch) {
              return {
                recipe: mealDbToRecipe(altMatch, { course: options.course }),
                isFromMealDb: true,
                mealDbRaw: altMatch,
              };
            }
          }
        }
      } catch {
        // Continue to category fallback
      }
    }

    // Step 3: Query TheMealDB by category fallback to obtain a valid database-backed recipe
    const fallbackCategory =
      options.category || (options.course === 'dessert' ? 'Dessert' : options.course === 'side' ? 'Side' : 'Miscellaneous');
    const categoryMeals = await mealDbService.filterByCategory(fallbackCategory, options.signal);
    if (categoryMeals.length > 0) {
      const fallbackMeal = await mealDbService.lookupById(categoryMeals[0].idMeal, options.signal);
      if (fallbackMeal) {
        return {
          recipe: mealDbToRecipe(fallbackMeal, { course: options.course }),
          isFromMealDb: true,
          mealDbRaw: fallbackMeal,
        };
      }
    }

    throw new RecipeError(`No matching recipe found in TheMealDB for "${trimmed}".`);
  },
};
