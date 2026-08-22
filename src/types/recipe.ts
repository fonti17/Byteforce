import type { LLMRequestOptions, LLMResponse } from './llm';

/** Course values allowed by `config/recipeConfig.json`. */
export const RECIPE_COURSES = ['starter', 'main', 'side', 'dessert', 'drink', 'snack'] as const;
export type RecipeCourse = (typeof RECIPE_COURSES)[number];

/** Diet flags allowed by `config/recipeConfig.json`. */
export const RECIPE_DIETS = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'lactose_free',
  'nut_free',
] as const;
export type RecipeDiet = (typeof RECIPE_DIETS)[number];

export interface RecipeIngredient {
  ingredient: string;
  /** Quantity for `Recipe.servings`, scaled to the event only when planning. */
  quantity: number;
  /** A `CateringUnit` — the same enum the shopping list uses. */
  unit: string;
  category: string | null;
  note: string | null;
}

/**
 * Mirrors `config/recipeConfig.json`, including `additionalProperties: false`.
 * Ingredient entries are key-compatible with `ShoppingListEntry`, so scaling a
 * recipe produces shopping list rows directly.
 */
export interface Recipe {
  name: string;
  description: string | null;
  servings: number;
  course: RecipeCourse | null;
  diet: RecipeDiet[];
  ingredients: RecipeIngredient[];
  steps: string[];
  source: string | null;
}

/** Storage envelope. The metadata is local bookkeeping, not part of the schema. */
export interface StoredRecipe {
  id: string;
  /** ISO timestamps, so an exported library stays readable. */
  createdAt: string;
  updatedAt: string;
  recipe: Recipe;
}

/** Shape of an exported library file, so imports can be checked before use. */
export interface RecipeLibraryFile {
  version: 1;
  exportedAt: string;
  recipes: StoredRecipe[];
}

export interface RecipeOptions extends LLMRequestOptions {
  language?: 'de' | 'en';
}

export interface RecipeTurn {
  recipe: Recipe;
  response: LLMResponse;
}
