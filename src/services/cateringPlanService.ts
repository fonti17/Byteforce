import cateringPlanConfig from '../../config/cateringPlanConfig.json' with { type: 'json' };
import { extractJsonObject } from '../lib/json.ts';
import { llmService } from './llmService.ts';
import {
  buildPlanFromRecipes,
  isExemptFromMealDb,
  mergeRecipesIntoPlan,
  mergeShoppingList,
  recipeContribution,
  recipeService,
  scaleRecipe,
} from './recipeService.ts';
import type {
  CateringMenuItem,
  CateringPlan,
  CateringPlanOptions,
  CateringPlanInput,
  CateringPlanTurn,
  ShoppingListEntry,
} from '../types/cateringPlan.ts';
import type { GatheringData, GatheringResult } from '../types/gathering.ts';
import type { LLMResponse } from '../types/llm.ts';
import type { Recipe } from '../types/recipe.ts';

export class CateringPlanError extends Error {
  /** Raw model answer, kept so a failed run can be inspected. */
  content?: string;

  constructor(message: string, content?: string) {
    super(message);
    this.name = 'CateringPlanError';
    this.content = content;
  }
}

function buildSystemPrompt(
  language: CateringPlanOptions['language'],
  hasRecipes: boolean,
  onlyOwnRecipes: boolean = false
): string {
  if (onlyOwnRecipes && hasRecipes) {
    return [
      'You are a professional catering helper.',
      'The menu is already strictly defined by the user’s own chosen recipes.',
      'Do NOT invent or add any new dishes or menu items.',
      'Return empty menu.items array and empty shoppingList array (all dishes and ingredient amounts are calculated from the selected recipes).',
      'Set menu.name to a fitting concise title for the chosen recipes.',
      '',
      'Return only one valid JSON object that conforms exactly to this JSON Schema:',
      JSON.stringify(cateringPlanConfig),
      '',
      language === 'en'
        ? 'Write all human-readable values in English.'
        : 'Write all human-readable values in German.',
      'Do not wrap the JSON in markdown code fences.',
      'Do not ask further questions.',
    ].join('\n');
  }

  return [
    'You are a professional catering planner.',
    'The information-gathering phase is complete. Use the supplied state as authoritative.',
    'Use the original request and context to preserve useful preferences and constraints that are not represented by fixed fields.',
    '',
    'Your task:',
    hasRecipes
      ? '1. The supplied recipes are already part of the menu. Complete the menu around them with what is still missing, for example a side, a salad, bread, a dessert, sauces, or drinks.'
      : '1. Propose one cohesive, high-quality catering menu suitable for the event type, date, meal, participant count, and budget.',
    '2. Derive all required ingredients from that menu.',
    '3. Calculate realistic total purchase quantities for the complete participant count.',
    '4. For food recipes, ALWAYS propose standard culinary dish names IN ENGLISH (e.g. "Beef Sunday Roast", "Chicken Tikka Masala", "Mushroom Risotto") because they must match English entries in TheMealDB database.',
    '',
    ...(hasRecipes
      ? [
          'Rules for the supplied recipes:',
          '- Their ingredient quantities are already calculated by the application. Do not repeat them in shoppingList.',
          '- Do not repeat them in menu.items either; list only the dishes you add.',
          '- Return empty arrays if the recipes already make a complete menu.',
          '',
        ]
      : []),
    'Return only one valid JSON object that conforms exactly to this JSON Schema:',
    JSON.stringify(cateringPlanConfig),
    '',
    language === 'en'
      ? 'Write all human-readable descriptions and titles in English.'
      : 'Write descriptions and menu name in German, but ALWAYS write individual dish names in English so they match TheMealDB.',
    'Use numeric quantities and one of the units allowed by the schema.',
    'Do not wrap the JSON in markdown code fences.',
    '',
    'Do not ask further questions. Do not add venue, decoration, seating, transport, or activity planning.',
  ].join('\n');
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value.replace(/[\s']/g, '')) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function parseMenuItems(value: unknown): CateringMenuItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const name = asText(record.name);
    return name === null ? [] : [{ name, description: asText(record.description) }];
  });
}

function parseShoppingList(value: unknown): ShoppingListEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const ingredient = asText(record.ingredient);
    const quantity = asNumber(record.quantity);
    const unit = asText(record.unit);
    if (ingredient === null || quantity === null || quantity <= 0 || unit === null) return [];
    return [{ ingredient, quantity, unit, category: asText(record.category) }];
  });
}

/**
 * Reads the part-2 answer into the shape of `config/cateringPlanConfig.json`.
 */
export function parseCateringPlan(
  content: string,
  { requireItems = true }: { requireItems?: boolean } = {}
): CateringPlan {
  const parsed = extractJsonObject(content);
  if (!parsed) throw new CateringPlanError('The plan response contained no JSON object.', content);

  const menuRecord =
    parsed.menu && typeof parsed.menu === 'object' ? (parsed.menu as Record<string, unknown>) : {};
  const items = parseMenuItems(menuRecord.items);
  const shoppingList = parseShoppingList(parsed.shoppingList);
  if (requireItems && (items.length === 0 || shoppingList.length === 0)) {
    throw new CateringPlanError('The plan response held no usable menu or shopping list.', content);
  }

  return {
    menu: { name: asText(menuRecord.name) ?? '', items },
    shoppingList,
  };
}

/**
 * What the model is told about the chosen recipes: the dishes and the totals the
 * application has already calculated, so it plans around them instead of repeating them.
 */
function describeRecipes(
  recipes: Recipe[],
  participantCount: number,
  language: CateringPlanOptions['language']
): string {
  const contribution = recipeContribution(recipes, participantCount);
  return [
    language === 'en'
      ? 'These recipes are already part of the menu, with quantities for every participant:'
      : 'Diese Rezepte sind bereits Teil des Menüs, mit Mengen für alle Teilnehmenden:',
    JSON.stringify(
      { menuItems: contribution.menuItems, alreadyOnShoppingList: contribution.shoppingList },
      null,
      2
    ),
  ].join('\n\n');
}

function resolvePlanInput(
  input: GatheringData | GatheringResult | CateringPlanInput
): { gatheringState: GatheringData | GatheringResult; originalRequest: string | null } {
  if ('gatheringState' in input) {
    return { gatheringState: input.gatheringState, originalRequest: input.originalRequest ?? null };
  }
  return { gatheringState: input, originalRequest: null };
}

function buildPlanMessages(
  input: GatheringData | GatheringResult | CateringPlanInput,
  options: CateringPlanOptions
): { role: 'user'; content: string }[] {
  const { language, recipes = [] } = options;
  const { gatheringState, originalRequest } = resolvePlanInput(input);
  const participantCount = gatheringState.participantCount ?? 0;
  return [
    {
      role: 'user',
      content: [
        language === 'en'
          ? 'Build a menu and the shopping list from this completed catering state:'
          : 'Erstelle aus diesem abgeschlossenen Catering-State ein Menü und die Einkaufsliste:',
        JSON.stringify(gatheringState, null, 2),
        ...(originalRequest
          ? [`${language === 'en' ? 'Original request:' : 'Original-Anfrage:'}\n${originalRequest}`]
          : []),
        ...(recipes.length > 0 && participantCount > 0
          ? [describeRecipes(recipes, participantCount, language)]
          : []),
      ].join('\n\n'),
    },
  ];
}

function buildPlanRequestOptions(options: CateringPlanOptions) {
  const { language, recipes: _recipes, onlyOwnRecipes, ...requestOptions } = options;
  const defaultModel = onlyOwnRecipes ? 'apertus-8b' : 'apertus-70b';
  return {
    ...requestOptions,
    model: options.model ?? defaultModel,
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens ?? 1800,
    systemPrompt: buildSystemPrompt(language, (_recipes ?? []).length > 0, onlyOwnRecipes),
  };
}

/**
 * Hydrates candidate dishes using TheMealDB for food recipes and direct AI for beverages/sauces.
 */
async function hydratePlanWithTheMealDb(
  basePlan: CateringPlan,
  selectedRecipes: Recipe[],
  participantCount: number,
  options: CateringPlanOptions
): Promise<CateringPlan> {
  const userRecipeNames = new Set(selectedRecipes.map((r) => r.name.toLowerCase()));
  const hydratedRecipes: Recipe[] = [];
  const finalMenuItems: CateringMenuItem[] = [];

  // 1. Add user selected recipes
  for (const r of selectedRecipes) {
    hydratedRecipes.push(r);
    finalMenuItems.push({ name: r.name, description: r.description });
  }

  // 2. Hydrate proposed dishes
  for (const item of basePlan.menu.items) {
    const lowerName = item.name.toLowerCase();
    if (userRecipeNames.has(lowerName)) {
      continue;
    }

    try {
      const resolved = await recipeService.resolveMealRecipe(item.name, {
        signal: options.signal,
        language: options.language,
        retryWithAi: true,
      });

      hydratedRecipes.push(resolved.recipe);
      finalMenuItems.push({
        name: resolved.recipe.name || item.name,
        description: item.description || resolved.recipe.description,
      });
    } catch {
      // If resolution fails (e.g. offline fallback), retain original menu item
      finalMenuItems.push(item);
    }
  }

  // 3. If recipes were successfully hydrated, calculate authoritative shopping list
  if (hydratedRecipes.length > 0 && participantCount > 0) {
    const allScaledEntries = hydratedRecipes.flatMap((r) => scaleRecipe(r, participantCount));
    const mergedShoppingList = mergeShoppingList([
      ...allScaledEntries,
      ...basePlan.shoppingList.filter((entry) =>
        isExemptFromMealDb(entry.ingredient).isExempt
      ),
    ]);

    return {
      menu: {
        name: basePlan.menu.name || 'Catering Menu',
        items: finalMenuItems,
      },
      shoppingList: mergedShoppingList.length > 0 ? mergedShoppingList : basePlan.shoppingList,
    };
  }

  return mergeRecipesIntoPlan(basePlan, selectedRecipes, participantCount);
}

export const cateringPlanService = {
  async create(
    input: GatheringData | GatheringResult | CateringPlanInput,
    options: CateringPlanOptions = {}
  ): Promise<LLMResponse> {
    return llmService.chat(buildPlanMessages(input, options), buildPlanRequestOptions(options));
  },

  /**
   * Part 2 end to end:
   * 1. Query AI for catering proposal.
   * 2. For food dishes, strictly look up in TheMealDB (with retry/fallback).
   * 3. For beverages and sauces, directly generate via AI.
   * 4. Scale quantities for the participant count and assemble final plan.
   */
  async plan(
    input: GatheringResult | CateringPlanInput,
    options: CateringPlanOptions = {}
  ): Promise<CateringPlanTurn> {
    const recipes = options.recipes ?? [];
    const { gatheringState } = resolvePlanInput(input);
    const gatheringResult = gatheringState as GatheringResult;
    const participantCount = gatheringResult.participantCount ?? 1;

    if (options.onlyOwnRecipes && recipes.length > 0) {
      return {
        plan: buildPlanFromRecipes(recipes, gatheringResult),
        response: { content: '', model: options.model ?? 'apertus-8b' },
      };
    }

    const response = await this.create(input, options);
    const parsed = parseCateringPlan(response.content, {
      requireItems: recipes.length === 0,
    });

    const hydratedPlan = await hydratePlanWithTheMealDb(
      parsed,
      recipes,
      participantCount,
      options
    );

    return {
      plan: hydratedPlan,
      response,
    };
  },

  async stream(
    input: GatheringResult | CateringPlanInput,
    options: CateringPlanOptions = {},
    onChunk?: (text: string) => void
  ): Promise<CateringPlanTurn> {
    let content = '';
    for await (const chunk of llmService.streamChat(
      buildPlanMessages(input, options),
      buildPlanRequestOptions(options)
    )) {
      content += chunk.delta;
      onChunk?.(content);
    }

    const recipes = options.recipes ?? [];
    const { gatheringState } = resolvePlanInput(input);
    const gatheringResult = gatheringState as GatheringResult;
    const participantCount = gatheringResult.participantCount ?? 1;

    if (options.onlyOwnRecipes && recipes.length > 0) {
      return {
        plan: buildPlanFromRecipes(recipes, gatheringResult),
        response: { content, model: options.model ?? 'apertus-8b' },
      };
    }

    const parsed = parseCateringPlan(content, {
      requireItems: recipes.length === 0,
    });

    const hydratedPlan = await hydratePlanWithTheMealDb(
      parsed,
      recipes,
      participantCount,
      options
    );

    return {
      plan: hydratedPlan,
      response: { content, model: options.model ?? 'apertus-70b' },
    };
  },
};
