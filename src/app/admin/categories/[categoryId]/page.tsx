import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { awardCategories, awardCycles } from "@/lib/db/schema";
import { saveCategoryAction } from "@/server/actions/configuration-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission, requireStaff } from "@/server/dal/auth";
export default async function EditCategory({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "configuration.manage")) notFound();
  const { categoryId } = await params;
  const db = getDb();
  const [[category], cycles] = await Promise.all([
    db
      .select()
      .from(awardCategories)
      .where(eq(awardCategories.id, categoryId))
      .limit(1),
    db.select().from(awardCycles).orderBy(asc(awardCycles.year)),
  ]);
  if (!category) notFound();
  return (
    <>
      <h1 className="page-heading">Edit category</h1>
      <p className="mt-2 text-graphite">
        Historical applications retain the category snapshot captured at
        submission.
      </p>
      <form
        action={saveCategoryAction}
        className="surface mt-7 grid max-w-3xl gap-5 rounded-lg p-6 md:grid-cols-2"
      >
        <input type="hidden" name="id" value={category.id} />
        <label className="flex flex-col gap-2 text-sm font-medium">
          Award cycle
          <select
            name="cycleId"
            defaultValue={category.cycleId}
            className="h-11 rounded-md border bg-white px-3"
          >
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Stable code
          <Input
            name="code"
            defaultValue={category.code}
            required
            className="h-11 bg-white"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Name
          <Input
            name="name"
            defaultValue={category.name}
            required
            className="h-11 bg-white"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Slug
          <Input
            name="slug"
            defaultValue={category.slug}
            required
            pattern="[a-z0-9-]+"
            className="h-11 bg-white"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
          Description
          <Textarea
            name="shortDescription"
            defaultValue={category.shortDescription ?? ""}
            className="bg-white"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Display order
          <Input
            name="displayOrder"
            type="number"
            min={0}
            defaultValue={category.displayOrder}
            className="h-11 bg-white"
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={category.isActive}
          />
          Active in public form
        </label>
        <div className="md:col-span-2 flex justify-end">
          <Button>Save category</Button>
        </div>
      </form>
    </>
  );
}
