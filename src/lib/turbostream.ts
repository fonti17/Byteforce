/**
 * Decoder for the React Router v7 / turbo-stream payload the Transgourmet
 * webshop embeds in its catalog HTML.
 *
 * The stream is a flat array in which every value is either a literal or an
 * index pointing at another slot of the same array, so a document is rebuilt by
 * resolving those references. Negative indices are sentinels (undefined, null,
 * NaN) and resolve to `null`.
 *
 * This runs inside the Vite dev middleware, which is why it stays free of any
 * browser or Node API.
 */

type Json = unknown;

export function decodeTurbostreamArray(payload: string | Json[]): Record<string, Json> {
  let stream: Json[];
  if (typeof payload === 'string') {
    try {
      stream = JSON.parse(payload) as Json[];
    } catch {
      return {};
    }
  } else {
    stream = payload;
  }

  if (!Array.isArray(stream) || stream.length === 0) return {};

  // A slot is memoised before its children are resolved, so a cyclic reference
  // resolves to the partially built object instead of recursing forever.
  const memo = new Map<number, Json>();

  const resolve = (index: Json): Json => {
    if (typeof index !== 'number' || !Number.isInteger(index)) {
      if (Array.isArray(index)) return index.map(resolve);
      if (index && typeof index === 'object') {
        return Object.fromEntries(
          Object.entries(index as Record<string, Json>).map(([key, value]) => [key, resolve(value)])
        );
      }
      return index;
    }

    if (index < 0 || index >= stream.length) return null;
    if (memo.has(index)) return memo.get(index);

    const raw = stream[index];

    if (Array.isArray(raw)) {
      const list: Json[] = [];
      memo.set(index, list);
      for (const element of raw) list.push(resolve(element));
      return list;
    }

    if (raw && typeof raw === 'object') {
      const object: Record<string, Json> = {};
      memo.set(index, object);
      for (const [key, value] of Object.entries(raw as Record<string, Json>)) {
        // `_12` means "the key itself lives in slot 12".
        if (key.startsWith('_')) {
          const keyIndex = Number(key.slice(1));
          const resolvedKey = Number.isInteger(keyIndex) ? resolve(keyIndex) : key;
          if (typeof resolvedKey === 'string' || typeof resolvedKey === 'number') {
            object[String(resolvedKey)] = resolve(value);
          }
        } else {
          object[key] = resolve(value);
        }
      }
      return object;
    }

    memo.set(index, raw);
    return raw;
  };

  const first = stream[0];
  const rootIndex = typeof first === 'number' && first >= 0 && first < stream.length ? first : 0;
  const result = resolve(rootIndex);
  return result && typeof result === 'object' && !Array.isArray(result)
    ? (result as Record<string, Json>)
    : { data: result };
}

/** Turns the escape sequences of the embedded JS string literal back into text. */
function unescapeJsString(raw: string): string {
  try {
    // The payload is the body of a double-quoted JS literal, so the JSON string
    // grammar covers every escape it actually uses.
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
}

/** Pulls the turbo-stream payload out of a catalog HTML response. */
export function decodeTurbostreamHtml(html: string): Record<string, Json> {
  if (!html) return {};

  const patterns = [
    /streamController\.enqueue\("((?:[^"\\]|\\.)*)"\)/,
    /streamController\.enqueue\('((?:[^'\\]|\\.)*)'\)/,
    /enqueue\s*:\s*'((?:[^'\\]|\\.)*)'/,
    /enqueue\s*:\s*"((?:[^"\\]|\\.)*)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeTurbostreamArray(unescapeJsString(match[1]));
  }

  const embedded = html.match(/<script id="__REACT_ROUTER_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (embedded) {
    try {
      return JSON.parse(embedded[1]) as Record<string, Json>;
    } catch {
      return {};
    }
  }

  return {};
}

/** Finds the `searchResponse` node wherever the route happened to place it. */
export function extractSearchResponse(decoded: Record<string, Json>): Record<string, Json> {
  const empty = { articles: [], totalCount: 0 };
  if (!decoded || typeof decoded !== 'object') return empty;

  const search = (node: Json, depth: number): Record<string, Json> | null => {
    if (depth > 12 || !node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const element of node) {
        const found = search(element, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const record = node as Record<string, Json>;
    const response = record.searchResponse;
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      return response as Record<string, Json>;
    }
    if (Array.isArray(record.articles)) return record;
    for (const value of Object.values(record)) {
      const found = search(value, depth + 1);
      if (found) return found;
    }
    return null;
  };

  return search(decoded, 0) ?? empty;
}
