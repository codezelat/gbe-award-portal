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
export default async function ProfilePage() {
  const { profile, session } = await requirePortalSession();
  const flags = await getFeatureFlags();
  const fields = [
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
  return (
    <>
      <h1 className="page-heading">Profile</h1>
      <p className="mt-2 text-graphite">
        Keep your permitted public-facing and contact information current.
      </p>
      <section className="surface mt-7 max-w-sm rounded-lg p-6">
        <h2 className="section-title mb-5">Profile image or logo</h2>
        <ProfileImageEditor
          accountKind={profile.accountKind}
          currentUrl={
            profile.profileImageFileId
              ? `/api/files/${profile.profileImageFileId}/download`
              : undefined
          }
        />
      </section>
      <section className="surface mt-7 rounded-lg p-6 md:p-8">
        <div className="mb-7 flex items-start gap-3 rounded-md bg-muted p-4">
          <LockKeyhole className="shrink-0 text-antique-gold" />
          <div>
            <p className="font-medium">Official account fields are locked</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Official name: {profile.officialName ?? profile.displayName} ·
              Login email: {session.user.email}. Contact info@gbeaward.com for
              corrections.
            </p>
          </div>
        </div>
        <form action={updateProfileAction}>
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
            <Field>
              <FieldLabel htmlFor="shortBio">
                Short biography / organisation profile
              </FieldLabel>
              <Textarea
                id="shortBio"
                name="shortBio"
                defaultValue={profile.shortBio ?? ""}
                maxLength={1000}
                className="min-h-40 bg-white"
              />
              <FieldDescription>Up to 1,000 characters.</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="mt-7 flex justify-end">
            <Button type="submit" className="h-12">
              <Save data-icon="inline-start" />
              Save changes
            </Button>
          </div>
        </form>
      </section>
    </>
  );
}
