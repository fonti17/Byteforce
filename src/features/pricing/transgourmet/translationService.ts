import { llmService } from '../../../shared/llm/llmService.ts';
import type { ApertusModelId } from '../../../shared/llm/llm';

/** In-memory cache for translated ingredient names to avoid redundant LLM requests. */
const translationCache = new Map<string, string>();

/**
 * Extracts a JSON string array from the model response, tolerating markdown fences
 * or leading/trailing commentary. Returns `null` if no valid array is found.
 */
export function extractJsonArray(content: string): string[] | null {
  const firstBracket = content.indexOf('[');
  const lastBracket = content.lastIndexOf(']');
  if (firstBracket === -1 || lastBracket <= firstBracket) return null;

  try {
    const parsed: unknown = JSON.parse(content.slice(firstBracket, lastBracket + 1));
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed.map((item) => item.trim());
    }
    return null;
  } catch {
    return null;
  }
}

export class TranslationService {
  private readonly defaultModel: ApertusModelId = 'apertus-8b';

  /**
   * Translates an array of culinary ingredient names (typically in English from
   * recipes/TheMealDB) into Swiss German grocery terms suitable for searching
   * PRODEGA / Transgourmet Switzerland.
   *
   * Uses the compact AI model (`apertus-8b`) for fast, cost-effective translation.
   */
  async translateIngredientsToGerman(
    ingredients: string[],
    options?: { signal?: AbortSignal; model?: ApertusModelId }
  ): Promise<string[]> {
    if (!ingredients || ingredients.length === 0) return [];

    const results: string[] = new Array(ingredients.length);
    const missingIndices: number[] = [];
    const missingTerms: string[] = [];

    // Check cache first
    for (let i = 0; i < ingredients.length; i++) {
      const raw = ingredients[i]?.trim() ?? '';
      if (!raw) {
        results[i] = raw;
        continue;
      }
      const cached = translationCache.get(raw.toLowerCase());
      if (cached) {
        results[i] = cached;
      } else {
        missingIndices.push(i);
        missingTerms.push(raw);
      }
    }

    // All terms resolved from cache
    if (missingTerms.length === 0) {
      return results;
    }

    const model = options?.model ?? this.defaultModel;
    const systemPrompt = [
      'You are a specialized culinary translator for Swiss wholesale gastronomy (PRODEGA / Transgourmet Switzerland).',
      'Translate the given list of culinary ingredient names into concise, standard Swiss German search terms suitable for finding products in a Swiss grocery catalog.',
      '',
      'Translation guidelines:',
      '- Use standard Swiss German terminology (e.g., "Pouletbrust" for chicken breast, "Vollrahm" for heavy cream, "Peperoni" for bell pepper, "Zucchetti" for zucchini, "Rindshackfleisch" for ground beef, "Gehackte Tomaten" for chopped tomatoes, "Olivenöl" for olive oil).',
      '- Strip brand names or superfluous cooking instructions (e.g., "diced onion" -> "Zwiebeln").',
      '- Return ONLY a JSON array of translated strings in the EXACT same order and length as the input list.',
      '- Do not output explanations, notes, or markdown fences outside the JSON array.',
    ].join('\n');

    try {
      const response = await llmService.chat(
        [
          {
            role: 'user',
            content: `Translate these ingredients into Swiss German for PRODEGA product search:\n${JSON.stringify(missingTerms)}`,
          },
        ],
        {
          model,
          temperature: 0,
          maxTokens: Math.min(1024, Math.max(200, missingTerms.length * 25)),
          systemPrompt,
          signal: options?.signal,
        }
      );

      const parsedTranslations = extractJsonArray(response.content);

      if (parsedTranslations && parsedTranslations.length === missingTerms.length) {
        for (let j = 0; j < missingTerms.length; j++) {
          const original = missingTerms[j];
          const translated = parsedTranslations[j] || original;
          const index = missingIndices[j];
          results[index] = translated;
          translationCache.set(original.toLowerCase(), translated);
        }
      } else {
        console.warn(
          `[translationService] Translation response count mismatch (expected ${missingTerms.length}, got ${parsedTranslations?.length ?? 0}). Falling back to originals.`
        );
        // Fallback for unparsed entries
        for (let j = 0; j < missingTerms.length; j++) {
          const original = missingTerms[j];
          const index = missingIndices[j];
          results[index] = original;
        }
      }
    } catch (error) {
      console.warn(
        '[translationService] Translation via smaller AI failed. Falling back to original ingredient names:',
        error instanceof Error ? error.message : error
      );
      // Safe fallback to original ingredient names
      for (let j = 0; j < missingTerms.length; j++) {
        const original = missingTerms[j];
        const index = missingIndices[j];
        results[index] = original;
      }
    }

    return results;
  }

  /** Clears the in-memory translation cache. */
  clearCache(): void {
    translationCache.clear();
  }
}

export const translationService = new TranslationService();
