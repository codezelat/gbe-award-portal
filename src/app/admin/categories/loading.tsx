import { FormPageSkeleton } from "@/components/shared/loading-skeletons";

export default function Loading() {
  return <FormPageSkeleton label="Loading categories" fields={6} />;
}
