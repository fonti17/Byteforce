/**
 * One purchasable article of the Transgourmet / PRODEGA webshop, reduced to the
 * fields a pricing decision actually needs. Everything here comes straight from
 * `web.transgourmet.ch/de/webshop/catalog`; nothing is estimated.
 */
export interface TransgourmetProduct {
  articleNumber: string;
  title: string;
  brand: string | null;
  /** Price of one `unitText` — for `unitText: "kg"` this is the price per kilo. */
  price: number;
  unitText: string;
  /** Price actually charged for one purchasable sales unit (one `sellUnit`). */
  pricePerSellUnit: number;
  /** How many `unitText` one sales unit contains. */
  sellAmount: number;
  sellUnit: string | null;
  isAction: boolean;
  oldPrice: number | null;
  isAvailable: boolean;
  origin: string[];
  ecoScore: string | null;
  /** Stated for variable-weight articles such as "ca. 5 kg". */
  approxWeight: number | null;
  imageUrl: string | null;
  productUrl: string;
}

/** Response of the catalog endpoint when a single term is asked for. */
export interface CatalogSearchResponse {
  query: string;
  totalCount: number;
  products: TransgourmetProduct[];
}

/** Catalog articles found for one ingredient of a shopping list. */
export interface CatalogCandidates {
  /** The ingredient as the shopping list spells it. */
  ingredient: string;
  /** The search term that actually produced `products`. */
  term: string;
  totalCount: number;
  products: TransgourmetProduct[];
  /**
   * Set when this one ingredient could not be looked up, leaving `products`
   * empty. The rest of the batch is unaffected — one unreachable position must
   * not cost the whole shopping list its prices.
   */
  error: string | null;
}

/** Response of the catalog endpoint when a whole shopping list is asked for. */
export interface CatalogBatchResponse {
  results: CatalogCandidates[];
}
