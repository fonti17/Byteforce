import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { recipeStore } from '../lib/recipeStore';
import {
  extractRecipeLocally,
  parseRecipe,
  recipeService,
  toStoredRecipe,
} from '../services/recipeService';
import type { Recipe, RecipeLibraryFile, RecipeOptions, StoredRecipe } from '../types/recipe';

/** Which converter produced the most recent import. */
export type RecipeSource = 'model' | 'local';

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

  // Callers pass an options literal, which would otherwise re-create `importText`
  // on every render.
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
    return record;
  }, []);

  /**
   * Converts pasted text into a stored recipe. Apertus is the primary converter;
   * if it is unreachable the deterministic parser still keeps the app usable.
   */
  const importText = useCallback(
    async (text: string): Promise<RecipeImportResult | null> => {
      const input = text.trim();
      if (!input) return null;

      setIsImporting(true);
      setError(null);
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

  const toggleSelected = useCallback((id: string): void => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  /** Backup file, so a library is not lost with the browser profile. */
  const exportLibrary = useCallback((): RecipeLibraryFile => {
    return { version: 1, exportedAt: new Date().toISOString(), recipes };
  }, [recipes]);

  /**
   * Accepts both file shapes: a library export, and a single recipe as
   * `config/recipeConfig.json` describes it — which is what the detail screen
   * downloads.
   */
  const importLibrary = useCallback(async (raw: string): Promise<number> => {
    const parsed: unknown = JSON.parse(raw);
    const candidates = Array.isArray(parsed)
      ? parsed
      : ((parsed as RecipeLibraryFile | null)?.recipes ?? []);
    const valid = candidates.filter(isStoredRecipe);

    if (valid.length === 0) {
      // A single recipe file goes through the same normalisation as a pasted one.
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
  }, [upsert]);

  const selected = useMemo(
    () => recipes.filter((entry) => selectedIds.includes(entry.id)),
    [recipes, selectedIds]
  );

  // Referentially stable while the selection does not change, so the planner
  // does not re-run part 2 on every render.
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
    save,
    remove,
    toggleSelected,
    clearSelection,
    exportLibrary,
    importLibrary,
  };
}
