import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recipeStore } from '../recipeStore';
import {
  extractRecipeLocally,
  isRecipeComplete,
  parseRecipe,
  recipeService,
  toStoredRecipe,
} from '../recipeService';
import type { Recipe, RecipeLibraryFile, RecipeOptions, StoredRecipe } from '../recipe';

/** Which converter produced the most recent import. */
export type RecipeSource = 'model' | 'local' | 'themealdb';

export interface RecipeImportResult {
  record: StoredRecipe;
  source: RecipeSource;
}

function isStoredRecipe(value: unknown): value is StoredRecipe {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const recipe = record.recipe as Record<string, unknown> | undefined;
  return typeof record.id === 'string' && Array.isArray(recipe?.ingredients);
}

/**
 * Owns the recipe library: everything is persisted through `recipeStore`, so an
 * installed app keeps its recipes across reloads and offline starts.
 */
export function useRecipes(options: RecipeOptions = {}) {
  const [recipes, setRecipes] = useState<StoredRecipe[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [source, setSource] = useState<RecipeSource | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Callers pass an options literal, which would otherwise re-create `importText` on every render.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    let isActive = true;
    void recipeStore
      .list()
      .then((stored) => {
        if (isActive) setRecipes(stored);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const upsert = useCallback(async (record: StoredRecipe): Promise<StoredRecipe> => {
    await recipeStore.put(record);
    setRecipes((current) => [record, ...current.filter((entry) => entry.id !== record.id)]);
    // An edit that reopens a required value takes the recipe back out of the event.
    if (!isRecipeComplete(record.recipe)) {
      setSelectedIds((current) => current.filter((entry) => entry !== record.id));
    }
    return record;
  }, []);

  /**
   * Search TheMealDB for recipes.
   */
  const searchMealDb = useCallback(async (query: string): Promise<Recipe[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return recipeService.lookupMealDb(trimmed);
  }, []);

  /**
   * Directly import a recipe from TheMealDB into stored recipes.
   */
  const importMealDbRecipe = useCallback(
    async (recipe: Recipe): Promise<StoredRecipe> => {
      setSource('themealdb');
      return upsert(toStoredRecipe(recipe));
    },
    [upsert]
  );

  /**
   * Converts pasted text or dish names into a stored recipe.
   * If a candidate dish exists in TheMealDB, TheMealDB database recipe is preferred.
   */
  const importText = useCallback(
    async (text: string): Promise<RecipeImportResult | null> => {
      const input = text.trim();
      if (!input) return null;

      setIsImporting(true);
      setError(null);

      // If the input is a single line / dish title, check TheMealDB first
      if (!input.includes('\n') && input.length < 80) {
        try {
          const dbMatches = await recipeService.lookupMealDb(input);
          if (dbMatches.length > 0) {
            setSource('themealdb');
            const record = await upsert(toStoredRecipe(dbMatches[0]));
            return { record, source: 'themealdb' };
          }
        } catch {
          // Continue to standard conversion
        }
      }

      try {
        const turn = await recipeService.convert(input, optionsRef.current);
        setSource('model');
        return { record: await upsert(toStoredRecipe(turn.recipe)), source: 'model' };
      } catch (caught) {
        const local = extractRecipeLocally(input);
        if (!local) {
          setError(caught instanceof Error ? caught : new Error('Recipe import failed'));
          return null;
        }
        setSource('local');
        return { record: await upsert(toStoredRecipe(local)), source: 'local' };
      } finally {
        setIsImporting(false);
      }
    },
    [upsert]
  );

  /** Saves a manually edited recipe back onto its stored record. */
  const save = useCallback(
    async (recipe: Recipe, existing?: StoredRecipe): Promise<StoredRecipe> =>
      upsert(toStoredRecipe(recipe, existing)),
    [upsert]
  );

  const remove = useCallback(async (id: string): Promise<void> => {
    await recipeStore.remove(id);
    setRecipes((current) => current.filter((entry) => entry.id !== id));
    setSelectedIds((current) => current.filter((entry) => entry !== id));
  }, []);

  /**
   * Picks a recipe for the event. A recipe with an open required value stays unselected.
   */
  const toggleSelected = useCallback(
    (id: string): void => {
      setSelectedIds((current) => {
        if (current.includes(id)) return current.filter((entry) => entry !== id);
        const record = recipes.find((entry) => entry.id === id);
        return record && isRecipeComplete(record.recipe) ? [...current, id] : current;
      });
    },
    [recipes]
  );

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  /** Backup file, so a library is not lost with the browser profile. */
  const exportLibrary = useCallback((): RecipeLibraryFile => {
    return { version: 1, exportedAt: new Date().toISOString(), recipes };
  }, [recipes]);

  /**
   * Accepts both file shapes: a library export, and a single recipe.
   */
  const importLibrary = useCallback(
    async (raw: string): Promise<number> => {
      const parsed: unknown = JSON.parse(raw);
      const candidates = Array.isArray(parsed)
        ? parsed
        : ((parsed as RecipeLibraryFile | null)?.recipes ?? []);
      const valid = candidates.filter(isStoredRecipe);

      if (valid.length === 0) {
        await upsert(toStoredRecipe(parseRecipe(raw)));
        return 1;
      }

      setRecipes((current) => {
        const byId = new Map(current.map((entry) => [entry.id, entry]));
        for (const entry of valid) byId.set(entry.id, entry);
        const merged = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        void recipeStore.replaceAll(merged);
        return merged;
      });
      return valid.length;
    },
    [upsert]
  );

  const selected = useMemo(
    () => recipes.filter((entry) => selectedIds.includes(entry.id)),
    [recipes, selectedIds]
  );

  const selectedRecipes = useMemo(() => selected.map((entry) => entry.recipe), [selected]);

  return {
    recipes,
    selected,
    selectedRecipes,
    selectedIds,
    isLoading,
    isImporting,
    source,
    error,
    importText,
    searchMealDb,
    importMealDbRecipe,
    save,
    remove,
    toggleSelected,
    clearSelection,
    exportLibrary,
    importLibrary,
  };
}
