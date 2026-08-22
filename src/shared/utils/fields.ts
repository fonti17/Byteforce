import type {
  EventType,
  GatheringData,
  GatheringField,
  MealType,
} from '../../features/gathering/gathering';
import type { Recipe, RecipeField } from '../../features/recipes/recipe';
import type { Language, Strings } from '../i18n/strings';

/**
 * One question covers one top-level property of `gatheringConfig.json`, even
 * where that property is backed by several leaf fields (date, budget).
 */
export type QuestionId = 'eventType' | 'date' | 'participantCount' | 'meal' | 'budget';

export const QUESTION_ORDER: QuestionId[] = [
  'eventType',
  'date',
  'participantCount',
  'meal',
  'budget',
];

const FIELDS_BY_QUESTION: Record<QuestionId, GatheringField[]> = {
  eventType: ['eventType'],
  date: ['date.day', 'date.month'],
  participantCount: ['participantCount'],
  meal: ['meal'],
  budget: ['budget.amount', 'budget.currency'],
};

export const EVENT_TYPE_OPTIONS: EventType[] = ['private', 'business', 'team_event', 'other'];
export const MEAL_OPTIONS: MealType[] = [
  'breakfast',
  'lunch',
  'dinner',
  'apero',
  'buffet',
  'other',
];
export const CURRENCY_OPTIONS = ['CHF', 'EUR', 'USD'];
export const PARTICIPANT_PRESETS = [10, 25, 50, 80];
export const BUDGET_PRESETS = [1000, 2500, 6000];

/** Questions still open, in schema order, derived from the missing leaf fields. */
export function openQuestions(missingFields: GatheringField[]): QuestionId[] {
  return QUESTION_ORDER.filter((question) =>
    FIELDS_BY_QUESTION[question].some((field) => missingFields.includes(field))
  );
}

export function questionLabel(question: QuestionId, t: Strings): string {
  switch (question) {
    case 'eventType': return t.labelEventType;
    case 'date': return t.labelDate;
    case 'participantCount': return t.labelParticipants;
    case 'meal': return t.labelMeal;
    case 'budget': return t.labelBudget;
  }
}

export function questionPrompt(question: QuestionId, t: Strings): string {
  switch (question) {
    case 'eventType': return t.qEventType;
    case 'date': return t.qDate;
    case 'participantCount': return t.qParticipants;
    case 'meal': return t.qMeal;
    case 'budget': return t.qBudget;
  }
}

function formatDate(data: GatheringData, language: Language): string | null {
  const { day, month, year } = data.date;
  if (day === null || month === null) return null;
  const locale = language === 'de' ? 'de-CH' : 'en-GB';
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' })
    .format(new Date(Date.UTC(2000, month - 1, 1)));
  return year === null ? `${day}. ${monthName}` : `${day}. ${monthName} ${year}`;
}

function formatBudget(data: GatheringData, language: Language): string | null {
  const { amount, currency } = data.budget;
  if (amount === null || currency === null) return null;
  return new Intl.NumberFormat(language === 'de' ? 'de-CH' : 'en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Localised display value, or `null` while the answer is still missing. */
export function formatAnswer(
  question: QuestionId,
  data: GatheringData,
  t: Strings,
  language: Language
): string | null {
  switch (question) {
    case 'eventType':
      return data.eventType ? t.eventType[data.eventType] : null;
    case 'date':
      return formatDate(data, language);
    case 'participantCount':
      return data.participantCount === null
        ? null
        : new Intl.NumberFormat(language === 'de' ? 'de-CH' : 'en-GB').format(data.participantCount);
    case 'meal':
      return data.meal ? t.meal[data.meal] : null;
    case 'budget':
      return formatBudget(data, language);
  }
}

/* -------------------------------------------------------------------------- */
/* Recipes                                                                    */
/* -------------------------------------------------------------------------- */

/** Household portion counts, the recipe counterpart of `PARTICIPANT_PRESETS`. */
export const RECIPE_SERVINGS_PRESETS = [2, 4, 6, 8, 12];

/** A recipe read from a text without a title is listed under a placeholder. */
export function recipeName(recipe: Recipe, t: Strings): string {
  return recipe.name.trim() === '' ? t.recipeUntitled : recipe.name;
}

/** Row subtitle wherever a recipe is listed; an open serving count says so. */
export function recipeSummary(recipe: Recipe, t: Strings): string {
  const servings =
    recipe.servings === null ? t.recipeServingsUnknown : t.recipeServings(recipe.servings);
  return `${servings} · ${t.recipeIngredients(recipe.ingredients.length)}`;
}

export function recipeFieldLabel(field: RecipeField, t: Strings): string {
  switch (field) {
    case 'name': return t.recipeNameLabel;
    case 'servings': return t.recipeServingsLabel;
    case 'ingredients': return t.recipeIngredientsLabel;
  }
}

export function recipeFieldPrompt(field: RecipeField, t: Strings): string {
  switch (field) {
    case 'name': return t.qRecipeName;
    case 'servings': return t.qRecipeServings;
    case 'ingredients': return t.qRecipeIngredients;
  }
}
