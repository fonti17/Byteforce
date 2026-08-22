import gatheringConfig from './gathering.config.json';
import { extractJsonObject } from '@/shared/utils/json';
import { llmService } from '@/shared/llm/llmService';
import type { LLMMessage } from '@/shared/llm/types';
import type {
  EventType,
  GatheringData,
  GatheringField,
  GatheringOptions,
  GatheringResult,
  GatheringState,
  GatheringTurn,
  GatheringUpdates,
  GatheringUncertainty,
  MealType,
} from './types';

const REQUIRED_FIELDS: GatheringField[] = [
  'eventType',
  'participantCount',
  'meal',
];
const OPTIONAL_FIELDS: GatheringField[] = [
  'date.day',
  'date.month',
  'date.year',
  'budget.amount',
  'budget.currency',
  'context',
];

const EVENT_TYPES = new Set<EventType>(['private', 'business', 'team_event', 'other']);
const MEALS = new Set<MealType>([
  'breakfast',
  'lunch',
  'dinner',
  'apero',
  'buffet',
  'other',
]);
const MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};
const supportedCurrencies = new Set(
  (Intl as typeof Intl & { supportedValuesOf?: (key: 'currency') => string[] })
    .supportedValuesOf?.('currency') ?? []
);

export class GatheringServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatheringServiceError';
  }
}

export function createInitialGatheringData(): GatheringData {
  return {
    eventType: null,
    date: { day: null, month: null, year: null },
    participantCount: null,
    meal: null,
    budget: { amount: null, currency: null },
    context: null,
  };
}

/**
 * Projects the gathered data onto the Part-1 schema shape. Returns `null` while
 * any required field is still missing, so callers can only ever hand out a
 * payload that validates against `gathering.config.json`.
 */
export function buildGatheringResult(data: GatheringData): GatheringResult | null {
  if (getMissingRequiredFields(data).length > 0) return null;
  return {
    eventType: data.eventType as EventType,
    date: {
      day: data.date.day as number,
      month: data.date.month as number,
      year: data.date.year,
    },
    participantCount: data.participantCount as number,
    meal: data.meal as MealType,
    budget: {
      amount: data.budget.amount,
      currency: data.budget.currency ?? 'CHF',
    },
    context: data.context,
  };
}

function valueAt(data: GatheringData, field: GatheringField): unknown {
  switch (field) {
    case 'eventType': return data.eventType;
    case 'date.day': return data.date.day;
    case 'date.month': return data.date.month;
    case 'date.year': return data.date.year;
    case 'participantCount': return data.participantCount;
    case 'meal': return data.meal;
    case 'budget.amount': return data.budget.amount;
    case 'budget.currency': return data.budget.currency;
    case 'context': return data.context;
  }
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function getMissingRequiredFields(data: GatheringData): GatheringField[] {
  return REQUIRED_FIELDS.filter((field) => !isPresent(valueAt(data, field)));
}

function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  if (supportedCurrencies.size > 0 && !supportedCurrencies.has(currency)) return null;
  return currency;
}

function normalizeUpdate(field: GatheringField, value: unknown): unknown {
  switch (field) {
    case 'eventType':
      return typeof value === 'string' && EVENT_TYPES.has(value as EventType) ? value : undefined;
    case 'date.day':
      return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 31 ? value : undefined;
    case 'date.month':
      return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 12 ? value : undefined;
    case 'date.year':
      return Number.isInteger(value) && Number(value) >= 1 ? value : undefined;
    case 'participantCount':
      return Number.isInteger(value) && Number(value) > 0 ? value : undefined;
    case 'meal':
      return typeof value === 'string' && MEALS.has(value as MealType) ? value : undefined;
    case 'budget.amount':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
    case 'budget.currency':
      return normalizeCurrency(value) ?? undefined;
    case 'context':
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  }
}

function setValue(data: GatheringData, field: GatheringField, value: unknown): void {
  switch (field) {
    case 'eventType': data.eventType = value as EventType; break;
    case 'date.day': data.date.day = value as number; break;
    case 'date.month': data.date.month = value as number; break;
    case 'date.year': data.date.year = value as number; break;
    case 'participantCount': data.participantCount = value as number; break;
    case 'meal': data.meal = value as MealType; break;
    case 'budget.amount': data.budget.amount = value as number; break;
    case 'budget.currency': data.budget.currency = value as string; break;
    case 'context': data.context = value as string; break;
  }
}

export function applyGatheringUpdates(
  currentData: GatheringData,
  proposedUpdates: GatheringUpdates
): { data: GatheringData; updates: GatheringUpdates } {
  const data = structuredClone(currentData);
  const updates: GatheringUpdates = {};

  for (const [path, proposedValue] of Object.entries(proposedUpdates)) {
    if (!REQUIRED_FIELDS.includes(path as GatheringField) && !OPTIONAL_FIELDS.includes(path as GatheringField)) continue;
    const field = path as GatheringField;
    const value = normalizeUpdate(field, proposedValue);
    if (value === undefined || Object.is(valueAt(data, field), value)) continue;
    setValue(data, field, value);
    updates[field] = value;
  }
  return { data, updates };
}

function parseNumber(raw: string): number | null {
  const normalized = raw.replace(/[\s']/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Deterministic safety net for explicit, common answers. Apertus remains the
 * primary extractor, but malformed model output never breaks the state machine.
 */
export function extractDeterministicUpdates(
  userMessage: string,
  expectedField: GatheringField | null
): GatheringUpdates {
  const text = userMessage.trim();
  const normalized = text.toLocaleLowerCase('de-CH');
  const updates: GatheringUpdates = {};

  if (/\b(teamessen|teamevent)\b/u.test(normalized)) updates.eventType = 'team_event';
  else if (/\b(firmenessen|geschäftsanlass|geschaeftsanlass)\b/u.test(normalized)) updates.eventType = 'business';
  else if (expectedField === 'eventType' && /\b(privat|privater anlass)\b/u.test(normalized)) updates.eventType = 'private';

  const monthEntry = Object.entries(MONTHS).find(([name]) => normalized.includes(name));
  if (monthEntry) {
    updates['date.month'] = monthEntry[1];
    const dayMatch = normalized.match(/\b([12]?\d|3[01])\s*\.?\s*(?:januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/u);
    if (dayMatch) updates['date.day'] = Number(dayMatch[1]);
  }

  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/u);
  if (yearMatch) updates['date.year'] = Number(yearMatch[0]);

  const participantMatch = normalized.match(/\b(?:etwa|ca\.?|circa|ungefähr)?\s*(\d+)\s*(?:personen|leute|teilnehmende|gäste)\b/u);
  if (participantMatch) updates.participantCount = Number(participantMatch[1]);

  if (/\b(frühstück|fruehstueck|breakfast)\b/u.test(normalized)) updates.meal = 'breakfast';
  else if (/\b(mittagessen|lunch|mittags essen)\b/u.test(normalized)) updates.meal = 'lunch';
  else if (/\b(abendessen|dinner|abends essen|am abend essen)\b/u.test(normalized)) updates.meal = 'dinner';
  else if (/\b(apéro|apero|aperitif)\b/u.test(normalized)) updates.meal = 'apero';
  else if (/\bbuffet\b/u.test(normalized)) updates.meal = 'buffet';

  const budgetMatch = text.match(/(\d[\d\s']*(?:[.,]\d+)?)\s*(CHF|EUR|USD)\b/u);
  if (budgetMatch) {
    const amount = parseNumber(budgetMatch[1]);
    if (amount !== null) updates['budget.amount'] = amount;
    updates['budget.currency'] = budgetMatch[2].toUpperCase();
  }

  if (expectedField === 'date.month' && !updates['date.month']) {
    const month = MONTHS[normalized];
    if (month) updates['date.month'] = month;
  } else if (expectedField === 'date.day' && !updates['date.day'] && /^\d{1,2}$/u.test(normalized)) {
    updates['date.day'] = Number(normalized);
  } else if (expectedField === 'participantCount' && !updates.participantCount) {
    const count = normalized.match(/\d+/u)?.[0];
    if (count) updates.participantCount = Number(count);
  } else if (expectedField === 'budget.amount' && !updates['budget.amount']) {
    const amount = parseNumber(normalized);
    if (amount !== null) updates['budget.amount'] = amount;
  } else if (expectedField === 'budget.currency' && !updates['budget.currency']) {
    const currency = normalizeCurrency(text);
    if (currency) updates['budget.currency'] = currency;
  }

  return updates;
}

function parseModelUpdates(content: string): GatheringUpdates {
  const parsed = extractJsonObject(content);
  if (!parsed) return {};
  const candidate = parsed.updates;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as GatheringUpdates
    : {};
}

interface ModelExtraction {
  updates: GatheringUpdates;
  context?: string;
  uncertain: GatheringUncertainty[];
}

function parseModelExtraction(content: string): ModelExtraction | null {
  const parsed = extractJsonObject(content);
  if (!parsed || (parsed.updates !== undefined &&
      (!parsed.updates || typeof parsed.updates !== 'object' || Array.isArray(parsed.updates)))) {
    return null;
  }

  const uncertain = Array.isArray(parsed.uncertain)
    ? parsed.uncertain.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const record = entry as Record<string, unknown>;
        return typeof record.reason === 'string' && record.reason.trim()
          ? [{
              field: typeof record.field === 'string' ? record.field as GatheringField : undefined,
              reason: record.reason.trim(),
            }]
          : [];
      })
    : [];

  return {
    updates: parseModelUpdates(content),
    context: typeof parsed.context === 'string' ? parsed.context.trim() : undefined,
    uncertain,
  };
}

function normalizeContext(value: string | undefined, current: string | null): string | null {
  const context = value?.trim();
  return context ? context : current;
}

async function requestExtraction(
  userTurn: LLMMessage,
  options: GatheringOptions,
  systemPrompt: string
) {
  const requestOptions = {
    ...options,
    model: options.model ?? 'apertus-8b',
    temperature: options.temperature ?? 0,
    maxTokens: options.maxTokens ?? 250,
    systemPrompt,
  };
  const response = await llmService.chat([userTurn], requestOptions);
  if (parseModelExtraction(response.content)) return response;

  // One bounded retry handles malformed JSON without creating an unbounded loop.
  return llmService.chat([userTurn], requestOptions);
}

function sanitizeModelUpdates(
  currentData: GatheringData,
  expectedField: GatheringField | null,
  deterministicUpdates: GatheringUpdates,
  modelUpdates: GatheringUpdates
): GatheringUpdates {
  const updates: GatheringUpdates = {};

  for (const [path, value] of Object.entries(modelUpdates)) {
    const field = path as GatheringField;
    if (!REQUIRED_FIELDS.includes(field) && !OPTIONAL_FIELDS.includes(field)) continue;

    // These two fields are especially prone to unwanted inference.
    if ((field === 'meal' || field === 'date.year') && deterministicUpdates[field] === undefined) {
      continue;
    }

    // Preserve known values unless the latest message contains an explicit
    // correction recognized by the deterministic extractor.
    if (
      isPresent(valueAt(currentData, field)) &&
      field !== expectedField &&
      deterministicUpdates[field] === undefined
    ) {
      continue;
    }
    updates[field] = value;
  }
  return updates;
}

function buildSystemPrompt(): string {
  return [
    'Extract information explicitly contained in the user message.',
    'You are only an extractor. The application controls state, missing fields, questions, and completion.',
    'Never invent or infer ambiguous information.',
    '',
    'Return only JSON in this format:',
    '{"updates":{"field.path":"value"},"context":"optional preferences and constraints","uncertain":[]}',
    '',
    'Allowed fields:',
    JSON.stringify([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]),
    '',
    'Rules:',
    '- Prefer expectedField when it is present; interpret a short answer as the answer to that field.',
    '- Extract only new or explicitly corrected values. Do not repeat unrelated currentState values.',
    '- Convert German month names to month numbers.',
    '- Never invent date.year. Omit it unless the user explicitly states a year.',
    '- "Teamessen" and "Teamevent" map to eventType="team_event". "Firmenessen" maps to eventType="business".',
    '- "Firmenessen" and "zum Essen kommen" do not imply meal="dinner".',
    '- "am Abend essen" and "Abendessen" map to meal="dinner".',
    '- "Apéro" and "Aperitif" map to meal="apero". "Buffet" maps to meal="buffet".',
    '- Put only additional dietary requirements, intolerances, cuisine styles, drink preferences, and free-form constraints in context. Do NOT repeat or include values that are already captured by the dedicated fields (eventType, date, participantCount, meal, budget).',
    '- Report ambiguous interpretations in uncertain as {"field":"field.path","reason":"..."}.',
    '- Split "2500 CHF" into budget.amount=2500 and budget.currency="CHF".',
    '- Do not return status, missing fields, questions, markdown, or prose.',
    '',
    'Part-1 schema:',
    JSON.stringify(gatheringConfig),
  ].join('\n');
}

export const gatheringService = {
  async process(
    userMessage: string,
    state: GatheringState,
    options: GatheringOptions = {}
  ): Promise<GatheringTurn> {
    const message = userMessage.trim();
    if (!message) throw new GatheringServiceError('A user message is required to continue gathering.');

    const extractionRequest = {
      currentState: state.data,
      originalRequest: state.originalRequest ?? message,
      expectedField: state.expectedField,
      userMessage: message,
    };
    const userTurn: LLMMessage = { role: 'user', content: JSON.stringify(extractionRequest) };
    const response = await requestExtraction(userTurn, options, buildSystemPrompt());

    const deterministic = extractDeterministicUpdates(message, state.expectedField);
    const extraction = parseModelExtraction(response.content) ?? {
      updates: {},
      uncertain: [],
    };
    const modelUpdates = sanitizeModelUpdates(
      state.data,
      state.expectedField,
      deterministic,
      extraction.updates
    );
    const proposed = { ...modelUpdates, ...deterministic };
    const { data, updates } = applyGatheringUpdates(state.data, proposed);
    const context = normalizeContext(extraction.context, data.context);
    if (context !== data.context) {
      data.context = context;
      updates.context = context;
    }

    return {
      data,
      originalRequest: state.originalRequest ?? message,
      expectedField: getMissingRequiredFields(data)[0] ?? null,
      updates,
      uncertain: extraction.uncertain,
      response,
    };
  },
};
