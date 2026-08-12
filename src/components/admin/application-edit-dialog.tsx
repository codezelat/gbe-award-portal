"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApplicationCorrectionForm } from "@/components/admin/application-correction-form";

type ApplicationEditDialogProps = {
  application: {
    id: string;
    currentVersion: number;
    nomineeName: string;
    designation: string | null;
    awardNomination: string;
    businessWebsite: string | null;
    emailDisplay: string;
    phoneDisplay: string;
    categoryId: string;
  };
  categories: Array<{ id: string; name: string }>;
  requiresElevatedConfirmation: boolean;
};

export function ApplicationEditDialog({
  application,
  categories,
  requiresElevatedConfirmation,
}: ApplicationEditDialogProps) {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="lg" />}>Edit details</DialogTrigger>
      <DialogContent
        className="inset-y-0 right-0 left-auto h-dvh w-full max-w-[calc(100%-1rem)] translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-l-xl rounded-r-none p-0 sm:max-w-2xl"
        aria-describedby="application-edit-description"
      >
        <DialogHeader className="sticky top-0 z-10 border-b bg-popover px-6 py-5 pr-14">
          <DialogTitle>Edit nomination details</DialogTitle>
          <DialogDescription id="application-edit-description">
            Save only the fields that need correction. Each save creates an
            audited new version.
          </DialogDescription>
        </DialogHeader>
        <ApplicationCorrectionForm className="grid gap-5 p-6 md:grid-cols-2">
          <input type="hidden" name="applicationId" value={application.id} />
          <input
            type="hidden"
            name="version"
            value={application.currentVersion}
          />
          <label className="flex flex-col gap-2 text-sm font-medium">
            Nominee / organisation
            <Input
              name="nomineeName"
              defaultValue={application.nomineeName}
              required
              minLength={2}
              maxLength={180}
              className="h-11 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Designation
            <Input
              name="designation"
              defaultValue={application.designation ?? ""}
              maxLength={120}
              className="h-11 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
            Award nomination
            <Textarea
              name="awardNomination"
              defaultValue={application.awardNomination}
              required
              minLength={10}
              maxLength={4000}
              className="min-h-36 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Website
            <Input
              name="businessWebsite"
              type="url"
              defaultValue={application.businessWebsite ?? ""}
              className="h-11 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Primary email
            <Input
              name="email"
              type="email"
              defaultValue={application.emailDisplay}
              required
              className="h-11 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Telephone
            <Input
              name="phoneDisplay"
              defaultValue={application.phoneDisplay}
              required
              minLength={5}
              maxLength={40}
              className="h-11 bg-white"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Award category
            <select
              name="categoryId"
              defaultValue={application.categoryId}
              className="h-11 rounded-md border bg-white px-3"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
            Reason for this correction
            <Textarea
              name="reason"
              required
              minLength={8}
              maxLength={1000}
              placeholder="For the audit record"
              className="min-h-24 bg-white"
            />
          </label>
          {requiresElevatedConfirmation ? (
            <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
              Current password
              <Input
                name="reauthPassword"
                type="password"
                autoComplete="current-password"
                className="h-11 bg-white"
              />
              <span className="font-normal text-xs text-muted-foreground">
                Required only if changing the primary email or award category.
              </span>
            </label>
          ) : null}
          <div className="flex justify-end border-t pt-5 md:col-span-2">
            <Button size="lg">Save changes</Button>
          </div>
        </ApplicationCorrectionForm>
      </DialogContent>
    </Dialog>
  );
}
