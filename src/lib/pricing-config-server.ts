import { cache } from "react";

import { getPricingConfig } from "./platform-settings";

/**
 * The pricing config for one server render. A public page reads it from the
 * layout, `generateMetadata` and the page body; `cache` makes those one DB read,
 * not three. Under the marketing layout's ISR the result is baked into the
 * prerendered page and refreshed with it (revalidate = 300).
 */
export const getRenderPricingConfig = cache(getPricingConfig);
