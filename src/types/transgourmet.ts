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

/** Response of the dev-server catalog endpoint. */
export interface CatalogSearchResponse {
  query: string;
  totalCount: number;
  products: TransgourmetProduct[];
}
