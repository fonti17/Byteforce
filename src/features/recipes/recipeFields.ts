import type { Strings } from '@/shared/i18n/strings';
import type { Recipe, RecipeField } from './types';

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
