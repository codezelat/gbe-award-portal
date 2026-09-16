import "server-only";
import { cache } from "react";
import { getOpenCycleCategories } from "@/server/dal/categories";
import { getNominationPricing } from "@/server/services/nomination-offers";
import { nominationPricing } from "@/lib/domain/nomination-pricing";

// The loading boundary and page share these reads within one render request.
export const getPublicNomination = cache(async () => {
  const context = await getOpenCycleCategories();
  const pricing = context.cycle
    ? await getNominationPricing(context.cycle)
    : nominationPricing({ year: 0, nominationFeeMinor: null, currency: null });
  return { ...context, pricing };
});
