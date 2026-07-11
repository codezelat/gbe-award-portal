import { LockKeyhole, Save } from "lucide-react";
import { requirePortalSession } from "@/server/dal/auth";
import { updateProfileAction } from "@/server/actions/applicant-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { ProfileImageEditor } from "@/components/uploads/profile-image-editor";
import { getFeatureFlags } from "@/server/services/feature-flags";

type ProfileField = {
  name: string;
  label: string;
  value: string | null;
  required?: boolean;
  type?: string;
};

export default async function ProfilePage() {
  const [{ profile, session }, flags] = await Promise.all([
    requirePortalSession(),
    getFeatureFlags(),
  ]);
  const fields: ProfileField[] = [
    {
      name: "displayName",
      label: "Preferred display name",
      value: profile.displayName,
      required: true,
    },
    {
      name: "designation",
      label: "Current designation",
      value: profile.designation,
    },
    {
      name: "industrySector",
      label: "Industry / sector",
      value: profile.industrySector,
    },
    { name: "phoneDisplay", label: "Telephone", value: profile.phoneDisplay },
    {
      name: "alternateEmail",
      label: "Alternate contact email",
      value: profile.alternateEmail,
      type: "email",
    },
    {
      name: "businessWebsite",
      label: "Business website",
      value: profile.businessWebsite,
      type: "url",
    },
    {
      name: "addressLine1",
      label: "Address line 1",
      value: profile.addressLine1,
    },
    {
      name: "addressLine2",
      label: "Address line 2",
      value: profile.addressLine2,
    },
    { name: "city", label: "City", value: profile.city },
    { name: "region", label: "Region", value: profile.region },
    { name: "postalCode", label: "Postal code", value: profile.postalCode },
    { name: "countryCode", label: "Country code", value: profile.countryCode },
    {
      name: "linkedinUrl",
      label: "LinkedIn URL",
      value: profile.linkedinUrl,
      type: "url",
    },
    {
      name: "facebookUrl",
      label: "Facebook URL",
      value: profile.facebookUrl,
      type: "url",
    },
    {
      name: "instagramUrl",
      label: "Instagram URL",
      value: profile.instagramUrl,
      type: "url",
    },
  ].filter(
    (field) =>
      flags.profile_social_fields_enabled ||
      !["linkedinUrl", "facebookUrl", "instagramUrl"].includes(field.name),
  );
  const contactFields = fields.slice(0, 6);
  const addressFields = fields.slice(6, 12);
  const socialFields = fields.filter((field) =>
    ["linkedinUrl", "facebookUrl", "instagramUrl"].includes(field.name),
  );
  return (
    <>
      <h1 className="page-heading">Profile</h1>
      <p className="mt-2 text-graphite">
        Keep your permitted public-facing and contact information current.
      </p>
      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-5 lg:sticky lg:top-24">
          <section className="surface rounded-lg p-6">
            <h2 className="section-title mb-5">Image or logo</h2>
            <ProfileImageEditor
              accountKind={profile.accountKind}
              currentUrl={
                profile.profileImageFileId
                  ? `/api/files/${profile.profileImageFileId}/download`
                  : undefined
              }
            />
          </section>
          <div className="flex items-start gap-3 px-1 text-sm text-muted-foreground">
            <LockKeyhole className="mt-0.5 shrink-0 text-antique-gold" />
            <p>
              <span className="font-medium text-foreground">
                Official details are locked.
              </span>{" "}
              {profile.officialName ?? profile.displayName} ·{" "}
              {session.user.email}
            </p>
          </div>
        </aside>
        <section className="surface rounded-lg p-6 md:p-8">
          <h2 className="section-title">Contact details</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Update the information used by the awards team.
          </p>
          <form action={updateProfileAction}>
            <div className="mt-6">
              <ProfileFields fields={contactFields} />
            </div>
            <details className="mt-7 border-t border-mist pt-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium marker:hidden">
                Address
                <span className="text-xs font-normal text-muted-foreground">
                  Optional
                </span>
              </summary>
              <div className="mt-5">
                <ProfileFields fields={addressFields} />
              </div>
            </details>
            {socialFields.length ? (
              <details className="mt-5 border-t border-mist pt-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium marker:hidden">
                  Social profiles
                  <span className="text-xs font-normal text-muted-foreground">
                    Optional
                  </span>
                </summary>
                <div className="mt-5">
                  <ProfileFields fields={socialFields} />
                </div>
              </details>
            ) : null}
            <details className="mt-5 border-t border-mist pt-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium marker:hidden">
                Biography or organisation profile
                <span className="text-xs font-normal text-muted-foreground">
                  Optional
                </span>
              </summary>
              <Field className="mt-5">
                <FieldLabel htmlFor="shortBio">Profile summary</FieldLabel>
                <Textarea
                  id="shortBio"
                  name="shortBio"
                  defaultValue={profile.shortBio ?? ""}
                  maxLength={1000}
                  className="min-h-40 bg-white"
                />
                <FieldDescription>Up to 1,000 characters.</FieldDescription>
              </Field>
            </details>
            <div className="mt-7 flex justify-end">
              <Button type="submit" className="h-12">
                <Save data-icon="inline-start" />
                Save changes
              </Button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}

function ProfileFields({ fields }: { fields: ProfileField[] }) {
  return (
    <FieldGroup>
      <div className="grid gap-5 md:grid-cols-2">
        {fields.map((field) => (
          <Field key={field.name}>
            <FieldLabel htmlFor={field.name}>{field.label}</FieldLabel>
            <Input
              id={field.name}
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={field.value ?? ""}
              required={field.required}
              className="h-[50px] bg-white"
            />
          </Field>
        ))}
      </div>
    </FieldGroup>
  );
}
