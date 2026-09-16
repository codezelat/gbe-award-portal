import { PublicNominationSkeleton } from "@/components/shared/loading-skeletons";
import {
  nominationPricing,
  NOMINATION_OFFER,
} from "@/lib/domain/nomination-pricing";

export default function Loading() {
  const pricing = nominationPricing({
    year: NOMINATION_OFFER.year,
    currency: NOMINATION_OFFER.currency,
    nominationFeeMinor: NOMINATION_OFFER.amountMinor,
  });
  return <PublicNominationSkeleton offerActive={pricing.phase === "active"} />;
}
