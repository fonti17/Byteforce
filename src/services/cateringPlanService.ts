import cateringPlanConfig from '../../config/cateringPlanConfig.json';
import { extractJsonObject } from '../lib/json';
import { llmService } from './llmService';
import type {
  CateringMenuItem,
  CateringPlan,
  CateringPlanBudget,
  CateringPlanOptions,
  CateringPlanTurn,
  ShoppingListEntry,
} from '../types/cateringPlan';
import type { GatheringData, GatheringResult } from '../types/gathering';
import type { LLMResponse } from '../types/llm';

export class CateringPlanError extends Error {
  /** Raw model answer, kept so a failed run can be inspected. */
  content?: string;

  constructor(message: string, content?: string) {
    super(message);
    this.name = 'CateringPlanError';
    this.content = content;
  }
}

function buildSystemPrompt(language: CateringPlanOptions['language']): string {
  return [
    'You are a professional catering planner.',
    'The information-gathering phase is complete. Use the supplied state as authoritative.',
    '',
    'Your task:',
    '1. Choose one coherent menu suitable for the event type, date, meal, participant count, and budget.',
    '2. Derive all required ingredients from that menu.',
    '3. Calculate realistic total purchase quantities for the complete participant count.',
    '4. Keep the proposal within the stated budget.',
    '',
    'Return only one valid JSON object that conforms exactly to this JSON Schema:',
    JSON.stringify(cateringPlanConfig),
    '',
    language === 'en'
      ? 'Write all human-readable values in English.'
      : 'Write all human-readable values in German.',
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

function parseBudget(value: unknown, fallbackCurrency: string): CateringPlanBudget {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const currency = asText(record.currency)?.toUpperCase();
  return {
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : fallbackCurrency,
    estimatedTotal: Math.max(asNumber(record.estimatedTotal) ?? 0, 0),
    note: asText(record.note) ?? '',
  };
}

/**
 * Reads the part-2 answer into the shape of `config/cateringPlanConfig.json`.
 * Unusable list entries are dropped; a missing menu or shopping list is an error,
 * because the view has nothing to show without them.
 */
export function parseCateringPlan(content: string, fallbackCurrency = 'CHF'): CateringPlan {
  const parsed = extractJsonObject(content);
  if (!parsed) throw new CateringPlanError('The plan response contained no JSON object.', content);

  const menuRecord =
    parsed.menu && typeof parsed.menu === 'object' ? (parsed.menu as Record<string, unknown>) : {};
  const items = parseMenuItems(menuRecord.items);
  const shoppingList = parseShoppingList(parsed.shoppingList);
  if (items.length === 0 || shoppingList.length === 0) {
    throw new CateringPlanError('The plan response held no usable menu or shopping list.', content);
  }

  return {
    menu: { name: asText(menuRecord.name) ?? '', items },
    shoppingList,
    budget: parseBudget(parsed.budget, fallbackCurrency),
  };
}

export const cateringPlanService = {
  async create(
    gatheringState: GatheringData | GatheringResult,
    options: CateringPlanOptions = {}
  ): Promise<LLMResponse> {
    const { language, ...requestOptions } = options;
    return llmService.chat(
      [{
        role: 'user',
        content: [
          language === 'en'
            ? 'Build a menu and the shopping list from this completed catering state:'
            : 'Erstelle aus diesem abgeschlossenen Catering-State ein Menü und die Einkaufsliste:',
          JSON.stringify(gatheringState, null, 2),
        ].join('\n\n'),
      }],
      {
        ...requestOptions,
        model: options.model ?? 'apertus-70b',
        temperature: options.temperature ?? 0.2,
        maxTokens: options.maxTokens ?? 1800,
        systemPrompt: buildSystemPrompt(language),
      }
    );
  },

  /** Part 2 end to end: one request, parsed into the schema shape. */
  async plan(
    gatheringResult: GatheringResult,
    options: CateringPlanOptions = {}
  ): Promise<CateringPlanTurn> {
    const response = await this.create(gatheringResult, options);
    return {
      plan: parseCateringPlan(response.content, gatheringResult.budget.currency),
      response,
    };
  },
};
