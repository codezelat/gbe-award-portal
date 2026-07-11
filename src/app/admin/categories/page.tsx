import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { awardCategories, awardCycles } from "@/lib/db/schema";
import { saveCategoryAction } from "@/server/actions/configuration-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission, requireStaff } from "@/server/dal/auth";
export default async function CategoriesPage() {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "configuration.manage")) notFound();
  const db = getDb();
  const [cycles, categories] = await Promise.all([
    db.select().from(awardCycles).orderBy(asc(awardCycles.year)),
    db
      .select({ category: awardCategories, cycleName: awardCycles.name })
      .from(awardCategories)
      .innerJoin(awardCycles, eq(awardCategories.cycleId, awardCycles.id))
      .orderBy(asc(awardCycles.year), asc(awardCategories.displayOrder)),
  ]);
  return (
    <>
      <h1 className="page-heading">Categories</h1>
      <p className="mt-2 text-graphite">
        Create, order and activate award categories without altering historical
        submission snapshots.
      </p>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="surface overflow-hidden rounded-lg">
          <div className="divide-y">
            {categories.map(({ category, cycleName }) => (
              <article
                key={category.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div>
                  <p className="font-medium">{category.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cycleName} · {category.code} · order{" "}
                    {category.displayOrder}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs ${category.isActive ? "status-success" : "bg-muted text-muted-foreground"}`}
                  >
                    {category.isActive ? "Active" : "Inactive"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link href={`/admin/categories/${category.id}`} />}
                  >
                    Edit
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="glass-feature h-fit rounded-lg p-5">
          <h2 className="text-lg font-semibold">Add category</h2>
          <form
            action={saveCategoryAction}
            className="mt-4 flex flex-col gap-3"
          >
            <select
              name="cycleId"
              required
              className="h-11 rounded-md border bg-white px-3"
            >
              {cycles.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.name}
                </option>
              ))}
            </select>
            <Input
              name="name"
              required
              minLength={2}
              maxLength={180}
              placeholder="Category name"
              className="h-11 bg-white"
            />
            <Input
              name="code"
              required
              minLength={2}
              maxLength={40}
              placeholder="Stable code"
              className="h-11 bg-white"
            />
            <Input
              name="slug"
              required
              pattern="[a-z0-9-]+"
              placeholder="category-slug"
              className="h-11 bg-white"
            />
            <Textarea
              name="shortDescription"
              maxLength={500}
              placeholder="Short public description"
              className="bg-white"
            />
            <Textarea
              name="internalNotes"
              maxLength={2000}
              placeholder="Internal notes (never public)"
              className="bg-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                name="capacity"
                type="number"
                min={1}
                placeholder="Capacity"
                className="h-11 bg-white"
              />
              <Input
                name="feeOverrideMinor"
                type="number"
                min={0}
                placeholder="Fee minor units"
                className="h-11 bg-white"
              />
            </div>
            <Input
              name="displayOrder"
              type="number"
              min={0}
              defaultValue={categories.length}
              className="h-11 bg-white"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked />
              Active in public form
            </label>
            <Button>Add category</Button>
          </form>
        </section>
      </div>
    </>
  );
}
