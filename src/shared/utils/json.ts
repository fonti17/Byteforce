/**
 * Reads the first JSON object out of a model answer, tolerating markdown fences
 * and prose around it. Returns `null` when nothing parseable is present.
 */
export function extractJsonObject(content: string): Record<string, unknown> | null {
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    const parsed: unknown = JSON.parse(content.slice(firstBrace, lastBrace + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
