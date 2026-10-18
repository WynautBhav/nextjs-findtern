/**
 * GST on Findtern invoices. Pure - no DB, safe for `node --test`.
 *
 * Rules, as the business runs them:
 *  - Listed INR prices are GST-inclusive at 18%. The taxable value is backed
 *    out of the total (total / 1.18), never added on top.
 *  - Place of supply = where the buyer is. Same state as the seller
 *    (Rajasthan) → 9% CGST + 9% SGST. Any other Indian state → 18% IGST.
 *  - Buyers outside India (USD orders) are an export of services: no GST.
 *
 * The buyer's state comes from, in order: their GSTIN (first two digits are
 * the state code), their billing PIN code (first digits are the postal
 * circle), then the free-text state on their profile.
 */

export const GST_RATE = 0.18;

/** Seller's state: Rajasthan. Overridden by the GSTIN's prefix when set. */
export const SELLER_STATE_CODE = "08";

export const STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

/* PIN prefix → GST state code. Three-digit entries override two-digit ones
 * where a postal circle spans states. Approximate at a few circle borders
 * (e.g. 396 Daman vs Valsad); a GSTIN, when present, always wins. The one
 * decision that matters for tax - Rajasthan or not - is exact: 30–34 is the
 * Rajasthan circle and nothing else. */
const PIN3: Record<string, string> = {
  "160": "04",
  "194": "38",
  "246": "05", "247": "05", "248": "05", "249": "05", "262": "05", "263": "05",
  "403": "30",
  "737": "11",
  "744": "35",
  "790": "12", "791": "12", "792": "12",
  "793": "17", "794": "17",
  "795": "14",
  "796": "15",
  "797": "13", "798": "13",
  "799": "16",
  "814": "20", "815": "20", "816": "20", "822": "20", "825": "20", "826": "20",
  "827": "20", "828": "20", "829": "20", "831": "20", "832": "20", "833": "20",
  "834": "20", "835": "20",
};

function pin2(prefix: number): string | null {
  if (prefix === 11) return "07";
  if (prefix >= 12 && prefix <= 13) return "06";
  if (prefix >= 14 && prefix <= 16) return "03";
  if (prefix === 17) return "02";
  if (prefix >= 18 && prefix <= 19) return "01";
  if (prefix >= 20 && prefix <= 28) return "09";
  if (prefix >= 30 && prefix <= 34) return "08";
  if (prefix >= 36 && prefix <= 39) return "24";
  if (prefix >= 40 && prefix <= 44) return "27";
  if (prefix >= 45 && prefix <= 48) return "23";
  if (prefix === 49) return "22";
  if (prefix === 50) return "36";
  if (prefix >= 51 && prefix <= 53) return "37";
  if (prefix >= 56 && prefix <= 59) return "29";
  if (prefix >= 60 && prefix <= 64) return "33";
  if (prefix >= 67 && prefix <= 69) return "32";
  if (prefix >= 70 && prefix <= 74) return "19";
  if (prefix >= 75 && prefix <= 77) return "21";
  if (prefix === 78) return "18";
  if (prefix >= 80 && prefix <= 85) return "10";
  return null;
}

export function stateCodeFromPincode(pincode: string | null | undefined): string | null {
  const pin = String(pincode ?? "").replace(/\D/g, "");
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  return PIN3[pin.slice(0, 3)] ?? pin2(Number(pin.slice(0, 2)));
}

export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  const code = String(gstin ?? "").trim().slice(0, 2);
  return STATE_NAMES[code] ? code : null;
}

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([code, name]) => [normalise(name), code]),
);
// Common spellings that differ from the GST register.
NAME_TO_CODE[normalise("Orissa")] = "21";
NAME_TO_CODE[normalise("NCT of Delhi")] = "07";
NAME_TO_CODE[normalise("New Delhi")] = "07";
NAME_TO_CODE[normalise("Pondicherry")] = "34";
NAME_TO_CODE[normalise("Jammu & Kashmir")] = "01";

function normalise(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
}

export function stateCodeFromName(state: string | null | undefined): string | null {
  return state ? (NAME_TO_CODE[normalise(state)] ?? null) : null;
}

export type Buyer = {
  currency: "INR" | "USD" | string;
  country?: string | null;
  gstin?: string | null;
  pincode?: string | null;
  state?: string | null;
};

/** What a page hands an invoice view about the buyer; the currency comes
 *  from each payment, so the place of supply is resolved per invoice. */
export type InvoiceBuyerProfile = {
  name: string;
  email?: string | null;
  gstin?: string | null;
  country?: string | null;
  pincode?: string | null;
  state?: string | null;
};

export type PlaceOfSupply =
  | { kind: "export" }
  | { kind: "india"; stateCode: string; stateName: string }
  | { kind: "unknown" };

export function placeOfSupply(buyer: Buyer): PlaceOfSupply {
  const country = String(buyer.country ?? "").trim().toLowerCase();
  if (String(buyer.currency).toUpperCase() !== "INR") return { kind: "export" };
  if (country && country !== "india" && country !== "in") return { kind: "export" };

  const code =
    stateCodeFromGstin(buyer.gstin) ?? stateCodeFromPincode(buyer.pincode) ?? stateCodeFromName(buyer.state);
  return code ? { kind: "india", stateCode: code, stateName: STATE_NAMES[code] } : { kind: "unknown" };
}

export type GstSplit = {
  /** Taxable value, minor units. */
  baseMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
  mode: "intra" | "inter" | "export";
};

/**
 * Split a GST-inclusive total. Parts always sum to the total exactly; when the
 * buyer's state is unknown it is treated as inter-state (IGST), which is the
 * safe default - the tax collected is the same 18% either way.
 */
export function splitGst(
  totalMinor: number,
  place: PlaceOfSupply,
  sellerStateCode: string = SELLER_STATE_CODE,
): GstSplit {
  if (place.kind === "export") {
    return { baseMinor: totalMinor, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, totalMinor, mode: "export" };
  }
  const baseMinor = Math.round(totalMinor / (1 + GST_RATE));
  const taxMinor = totalMinor - baseMinor;
  if (place.kind === "india" && place.stateCode === sellerStateCode) {
    const cgstMinor = Math.floor(taxMinor / 2);
    return { baseMinor, cgstMinor, sgstMinor: taxMinor - cgstMinor, igstMinor: 0, totalMinor, mode: "intra" };
  }
  return { baseMinor, cgstMinor: 0, sgstMinor: 0, igstMinor: taxMinor, totalMinor, mode: "inter" };
}

/** Seller GSTIN from env; null when unset so invoices say so instead of
 *  printing a made-up number. */
export function sellerGstin(): string | null {
  const v = (typeof process !== "undefined" ? process.env.FINDTERN_GSTIN : undefined)?.trim();
  return v && /^[0-9]{2}[A-Z0-9]{13}$/.test(v) ? v : null;
}

export function sellerStateCode(): string {
  return stateCodeFromGstin(sellerGstin()) ?? SELLER_STATE_CODE;
}
