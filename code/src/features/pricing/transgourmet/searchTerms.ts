/**
 * Turning an ingredient of a shopping list into catalog search terms.
 *
 * A shopping list says "frische Rüebli, geschält"; the catalog is indexed on
 * "Rüebli". The terms are tried in order, widest last, so a precise name still
 * wins when it matches.
 *
 * This runs on the server, next to the catalog access — the walk over the terms
 * costs one webshop request per term, and doing it there keeps a whole shopping
 * list inside a single request from the browser.
 */

/** Search terms for one ingredient, most precise first. */
export function searchTermsFor(ingredient: string): string[] {
  const cleaned = ingredient
    .replace(/\(.*?\)/g, ' ')
    .replace(/[,;/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter((word) => word.length > 2);
  const terms = [cleaned];

  // Swiss recipes name the state before the food: "frische Peterli" → "Peterli".
  const withoutQualifier = words.filter(
    (word) => !/^(frisch|frische|frischer|frisches|getrocknet|getrocknete|bio|ganze|ganzer|gemahlen|gemahlene|geschält|geschälte|gehackt|gehackte|fresh|dried|whole|ground|chopped|peeled)$/i.test(word)
  );
  if (withoutQualifier.length > 0 && withoutQualifier.length < words.length) {
    terms.push(withoutQualifier.join(' '));
  }

  // The head noun alone is the widest net the catalog still answers usefully.
  const longest = [...withoutQualifier].sort((a, b) => b.length - a.length)[0];
  if (longest) terms.push(longest);

  return [...new Set(terms.filter((term) => term.length > 1))];
}
