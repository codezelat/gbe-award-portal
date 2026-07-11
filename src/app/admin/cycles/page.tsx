import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getDb } from "@/lib/db";
import { awardCycles } from "@/lib/db/schema";
import {
  createCycleAction,
  saveCycleAction,
} from "@/server/actions/configuration-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission, requireStaff } from "@/server/dal/auth";
const local = (date: Date | null) =>
  date ? format(date, "yyyy-MM-dd'T'HH:mm") : "";
export default async function CyclesPage() {
  const { membership } = await requireStaff();
  if (!hasPermission(membership, "configuration.manage")) notFound();
  const cycles = await getDb()
    .select()
    .from(awardCycles)
    .orderBy(desc(awardCycles.year));
  return (
    <>
      <h1 className="page-heading">Award cycles</h1>
      <p className="mt-2 text-graphite">
        Guarded configuration for dates, public copy, declaration and lifecycle
        state.
      </p>
      <details className="glass-feature mt-7 rounded-lg p-5">
        <summary className="cursor-pointer font-semibold">
          Create future award cycle
        </summary>
        <form
          action={createCycleAction}
          className="mt-5 grid gap-4 md:grid-cols-2"
        >
          <Input
            name="name"
            required
            placeholder="Cycle name"
            className="h-11 bg-white"
          />
          <Input
            name="slug"
            required
            pattern="[a-z0-9-]+"
            placeholder="cycle-slug"
            className="h-11 bg-white"
          />
          <Input
            name="year"
            type="number"
            min={2026}
            max={2200}
            required
            placeholder="Year"
            className="h-11 bg-white"
          />
          <Input
            name="heading"
            required
            placeholder="Public heading"
            className="h-11 bg-white"
          />
          <Input
            name="opensAt"
            type="datetime-local"
            required
            className="h-11 bg-white"
          />
          <Input
            name="closesAt"
            type="datetime-local"
            required
            className="h-11 bg-white"
          />
          <Textarea
            name="introCopy"
            required
            minLength={10}
            placeholder="Public introduction"
            className="bg-white md:col-span-2"
          />
          <Textarea
            name="declarationText"
            required
            minLength={20}
            placeholder="Approved declaration text"
            className="bg-white md:col-span-2"
          />
          <Input
            name="declarationVersion"
            required
            placeholder="Declaration version"
            className="h-11 bg-white"
          />
          <Input
            name="termsVersion"
            required
            placeholder="Terms version"
            className="h-11 bg-white"
          />
          <Input
            name="privacyVersion"
            required
            placeholder="Privacy version"
            className="h-11 bg-white"
          />
          <div className="flex justify-end">
            <Button>Create draft cycle</Button>
          </div>
        </form>
      </details>
      <div className="mt-7 flex flex-col gap-6">
        {cycles.map((cycle) => (
          <section key={cycle.id} className="surface rounded-lg p-6">
            <form
              action={saveCycleAction}
              className="grid gap-5 md:grid-cols-2"
            >
              <input type="hidden" name="id" value={cycle.id} />
              <label className="flex flex-col gap-2 text-sm font-medium">
                Cycle name
                <Input
                  name="name"
                  defaultValue={cycle.name}
                  required
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Status
                <select
                  name="status"
                  defaultValue={cycle.status}
                  className="h-11 rounded-md border bg-white px-3"
                >
                  {awardCycles.status.enumValues.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Opens at
                <Input
                  name="opensAt"
                  type="datetime-local"
                  defaultValue={local(cycle.opensAt)}
                  required
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Closes at
                <Input
                  name="closesAt"
                  type="datetime-local"
                  defaultValue={local(cycle.closesAt)}
                  required
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Results release
                <Input
                  name="resultsReleaseAt"
                  type="datetime-local"
                  defaultValue={local(cycle.resultsReleaseAt)}
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Support email
                <Input
                  name="supportEmail"
                  type="email"
                  defaultValue={cycle.supportEmail}
                  required
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
                Public heading
                <Input
                  name="heading"
                  defaultValue={cycle.heading}
                  required
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
                Public introduction
                <Textarea
                  name="introCopy"
                  defaultValue={cycle.introCopy}
                  required
                  className="min-h-28 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Fee in minor units
                <Input
                  name="nominationFeeMinor"
                  type="number"
                  min={0}
                  defaultValue={cycle.nominationFeeMinor ?? ""}
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Currency
                <Input
                  name="currency"
                  maxLength={3}
                  defaultValue={cycle.currency ?? ""}
                  className="h-11 bg-white uppercase"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
                Declaration
                <Textarea
                  name="declarationText"
                  defaultValue={cycle.declarationText}
                  required
                  className="bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Declaration version
                <Input
                  name="declarationVersion"
                  defaultValue={cycle.declarationVersion}
                  required
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Terms version
                <Input
                  name="termsVersion"
                  defaultValue={cycle.termsVersion}
                  required
                  className="h-11 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium">
                Privacy version
                <Input
                  name="privacyVersion"
                  defaultValue={cycle.privacyVersion}
                  required
                  className="h-11 bg-white"
                />
              </label>
              <div className="flex items-end justify-end">
                <Button>Save guarded cycle changes</Button>
              </div>
            </form>
          </section>
        ))}
      </div>
    </>
  );
}
