import { PublicNominationSkeleton } from "@/components/shared/loading-skeletons";
import { getPublicNomination } from "@/server/dal/public-nomination";

export default async function Loading() {
  const { pricing } = await getPublicNomination();
  return <PublicNominationSkeleton offerActive={pricing.phase === "active"} />;
}
