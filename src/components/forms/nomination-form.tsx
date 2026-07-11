"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronsUpDown,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  X,
} from "lucide-react";
import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";
import countryNames from "i18n-iso-countries";
import englishCountryNames from "i18n-iso-countries/langs/en.json";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import { declarationText } from "@/config/brand";
import {
  publicApplicationSchema,
  type PublicApplicationInput,
} from "@/lib/validation/application";
import {
  FilePicker,
  type SelectedUpload,
} from "@/components/uploads/file-picker";
import { Turnstile } from "./turnstile";

type Category = { id: string; name: string };
countryNames.registerLocale(englishCountryNames);
type UploadTarget = {
  id: string;
  url: string;
  headers: Record<string, string>;
};
type InitiatedData = {
  sessionToken: string;
  uploads: UploadTarget[];
};
type InitiateResponse =
  | { ok: true; data: InitiatedData }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string[]>;
    };
type SubmissionStage =
  | "idle"
  | "preparing"
  | "uploading"
  | "upload_failed"
  | "finalising"
  | "completion_failed"
  | "success";

function uploadFile(
  upload: SelectedUpload,
  target: UploadTarget,
  signal: AbortSignal,
  onProgress: (value: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.open("PUT", target.url);
    Object.entries(target.headers).forEach(([key, value]) =>
      xhr.setRequestHeader(key, value),
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      signal.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}.`));
    };
    xhr.onerror = () =>
      reject(new Error("The upload connection was interrupted."));
    xhr.onabort = () =>
      reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.send(upload.file);
  });
}

export function NominationForm({
  categories,
  unavailable,
}: {
  categories: Category[];
  unavailable?: boolean;
}) {
  const [supporting, setSupporting] = useState<SelectedUpload[]>([]);
  const [payment, setPayment] = useState<SelectedUpload[]>([]);
  const [fileError, setFileError] = useState<string>();
  const [stage, setStage] = useState<SubmissionStage>("idle");
  const [reference, setReference] = useState("");
  const [session, setSession] = useState<InitiatedData | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [turnstileReset, setTurnstileReset] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const form = useForm<PublicApplicationInput>({
    resolver: zodResolver(publicApplicationSchema),
    shouldFocusError: true,
    defaultValues: {
      nomineeName: "",
      designation: "",
      industrySector: "",
      businessWebsite: "",
      email: "",
      phone: "",
      categoryId: "",
      declarationAccepted: false,
      declarationText,
      turnstileToken: "",
      honeypot: "",
      startedAt,
      idempotencyKey,
    },
  });

  const allFiles = useMemo(
    () => [...supporting, ...payment],
    [supporting, payment],
  );
  const overallProgress = allFiles.length
    ? Math.round(
        allFiles.reduce(
          (sum, file) =>
            sum + (file.status === "uploaded" ? 100 : file.progress),
          0,
        ) / allFiles.length,
      )
    : 0;
  const busy = ["preparing", "uploading", "finalising"].includes(stage);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function updateFile(id: string, patch: Partial<SelectedUpload>) {
    const update = (files: SelectedUpload[]) =>
      files.map((file) => (file.id === id ? { ...file, ...patch } : file));
    setSupporting(update);
    setPayment(update);
  }

  function beginFreshUploadSession() {
    const nextStartedAt = Date.now();
    const nextKey = crypto.randomUUID();
    setStartedAt(nextStartedAt);
    setIdempotencyKey(nextKey);
    form.setValue("startedAt", nextStartedAt);
    form.setValue("idempotencyKey", nextKey);
    form.setValue("turnstileToken", "");
    setTurnstileReset((value) => value + 1);
    setSession(null);
    setSupporting((files) =>
      files.map((file) => ({
        ...file,
        status: "ready",
        progress: 0,
        error: undefined,
      })),
    );
    setPayment((files) =>
      files.map((file) => ({
        ...file,
        status: "ready",
        progress: 0,
        error: undefined,
      })),
    );
    form.clearErrors("root");
    setStage("idle");
  }

  function changeFiles(kind: SelectedUpload["kind"], files: SelectedUpload[]) {
    if (session) beginFreshUploadSession();
    if (kind === "supporting_document") setSupporting(files);
    else setPayment(files);
  }

  async function runSubmission(values: PublicApplicationInput) {
    if (payment.length !== 1) {
      setFileError("Choose one payment slip or screenshot.");
      errorSummaryRef.current?.focus();
      return;
    }
    setFileError(undefined);
    form.clearErrors("root");
    let activeSession = session;
    try {
      if (!activeSession) {
        setStage("preparing");
        const response = await fetch("/api/public/applications/initiate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...values,
            files: allFiles.map(({ id, file, kind }) => ({
              id,
              name: file.name,
              size: file.size,
              type: file.type,
              kind,
            })),
          }),
        });
        const initiated = (await response.json()) as InitiateResponse;
        if (!initiated.ok) throw new Error(initiated.message);
        activeSession = initiated.data;
        setSession(activeSession);
      }

      const pendingFiles = allFiles.filter(
        (file) => file.status !== "uploaded",
      );
      if (pendingFiles.length) {
        setStage("uploading");
        const controller = new AbortController();
        abortRef.current = controller;
        const outcomes = await Promise.allSettled(
          pendingFiles.map(async (file) => {
            const target = activeSession!.uploads.find(
              (upload) => upload.id === file.id,
            );
            if (!target)
              throw new Error("An upload destination was not created.");
            updateFile(file.id, {
              status: "uploading",
              progress: 0,
              error: undefined,
            });
            try {
              await uploadFile(file, target, controller.signal, (progress) =>
                updateFile(file.id, { progress }),
              );
              updateFile(file.id, { status: "uploaded", progress: 100 });
            } catch (error) {
              updateFile(file.id, {
                status: "failed",
                error:
                  error instanceof DOMException && error.name === "AbortError"
                    ? "Cancelled"
                    : "Upload failed — retry this file",
              });
              throw error;
            }
          }),
        );
        abortRef.current = null;
        if (outcomes.some((outcome) => outcome.status === "rejected")) {
          setStage("upload_failed");
          form.setError("root", {
            message:
              "One or more files did not upload. Successful files are preserved; retry only the failed files.",
          });
          errorSummaryRef.current?.focus();
          return;
        }
      }

      setStage("finalising");
      const complete = await fetch("/api/public/applications/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionToken: activeSession.sessionToken,
          idempotencyKey: values.idempotencyKey,
        }),
      });
      const result = (await complete.json()) as {
        ok: boolean;
        message?: string;
        data?: { reference: string };
      };
      if (!result.ok || !result.data?.reference)
        throw new Error(result.message ?? "Final confirmation failed.");
      setReference(result.data.reference);
      setStage("success");
      form.reset();
      setSupporting([]);
      setPayment([]);
    } catch (error) {
      abortRef.current = null;
      if (!activeSession) {
        setStage("idle");
        form.setValue("turnstileToken", "");
        setTurnstileReset((value) => value + 1);
      } else if (stage !== "uploading") {
        setStage("completion_failed");
      }
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "We could not submit your nomination. Your entered information is safe. Please try again.",
      });
      errorSummaryRef.current?.focus();
    }
  }

  function handleInvalid() {
    window.setTimeout(() => errorSummaryRef.current?.focus(), 0);
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    void form.handleSubmit(runSubmission, handleInvalid)(event);
  }
  const retry = () => void form.handleSubmit(runSubmission, handleInvalid)();
  const errors = form.formState.errors;
  const hasVisibleError = Boolean(
    errors.root ||
      Object.keys(errors).some((key) => key !== "root") ||
      fileError,
  );
  useEffect(() => {
    if (!hasVisibleError) return;
    const frame = window.requestAnimationFrame(() =>
      errorSummaryRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [hasVisibleError]);

  if (stage === "success")
    return (
      <section
        className="glass-feature rounded-xl p-8 text-center md:p-12"
        aria-live="polite"
      >
        <CheckCircle2 className="mx-auto mb-5 size-12 text-[#23604e]" />
        <h2 className="font-display text-4xl font-semibold">
          Nomination received
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-graphite">
          Thank you. Your official application reference is shown below and has
          been sent to your email address.
        </p>
        <p className="mx-auto mt-6 w-fit rounded-md border border-champagne bg-gold-wash px-5 py-3 font-mono text-lg font-semibold tracking-wider">
          {reference}
        </p>
      </section>
    );

  const visibleErrors = Object.entries(errors)
    .filter(([key]) => key !== "root")
    .map(([, value]) => value?.message)
    .filter((message): message is string => typeof message === "string");
  return (
    <form
      onSubmit={submit}
      noValidate
      className="surface overflow-hidden rounded-lg"
      aria-describedby={
        errors.root || visibleErrors.length ? "form-error" : undefined
      }
    >
      {errors.root || visibleErrors.length || fileError ? (
        <Alert
          variant="destructive"
          className="m-6"
          id="form-error"
          ref={errorSummaryRef}
          tabIndex={-1}
        >
          <AlertCircle />
          <AlertTitle>Review the nomination</AlertTitle>
          <AlertDescription>
            {errors.root?.message ? <p>{errors.root.message}</p> : null}
            {visibleErrors.length || fileError ? (
              <ul className="mt-2 list-disc pl-5">
                {visibleErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
                {fileError ? <li>{fileError}</li> : null}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {unavailable ? (
        <Alert className="m-6">
          <AlertCircle />
          <AlertTitle>Applications are not open yet</AlertTitle>
          <AlertDescription>
            The award cycle and categories have not been configured. Please
            contact info@gbeaward.com.
          </AlertDescription>
        </Alert>
      ) : null}
      <FormSection number="1" title="Nominee details">
        <FieldGroup>
          <div className="grid gap-5 md:grid-cols-2">
            <ControlledInput
              form={form}
              name="nomineeName"
              label="Full Name / Company Name"
              required
            />
            <ControlledInput
              form={form}
              name="designation"
              label="Designation"
              description="Complete this only when nominating an individual."
            />
          </div>
          <ControlledInput
            form={form}
            name="industrySector"
            label="Industry / Business Sector"
            required
          />
          <ControlledInput
            form={form}
            name="businessWebsite"
            label="Business Website"
            description="If applicable"
            inputMode="url"
          />
        </FieldGroup>
      </FormSection>
      <FormSection number="2" title="Contact details">
        <FieldGroup>
          <ControlledInput
            form={form}
            name="email"
            label="Email Address"
            required
            inputMode="email"
          />
          <PhoneField form={form} />
        </FieldGroup>
      </FormSection>
      <FormSection number="3" title="Nomination">
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="categoryId">
                Award Nomination / Category{" "}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </FieldLabel>
              <CategoryCombobox
                categories={categories}
                value={field.value}
                onValueChange={field.onChange}
                disabled={unavailable || busy}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FormSection>
      <FormSection number="4" title="Documents">
        <FieldGroup>
          <Field>
            <FieldLabel>Supporting Documents</FieldLabel>
            <FieldDescription>Optional · up to five files</FieldDescription>
            <FilePicker
              kind="supporting_document"
              files={supporting}
              onChange={(files) => changeFiles("supporting_document", files)}
              disabled={busy}
              onRetry={retry}
            />
          </Field>
          <Field data-invalid={Boolean(fileError)}>
            <FieldLabel>
              Payment Slip or Screenshot{" "}
              <span aria-hidden className="text-destructive">
                *
              </span>
            </FieldLabel>
            <FieldDescription>
              One payment-proof file is required.
            </FieldDescription>
            <FilePicker
              kind="payment_proof"
              files={payment}
              onChange={(files) => changeFiles("payment_proof", files)}
              error={fileError}
              disabled={busy}
              onRetry={retry}
            />
          </Field>
        </FieldGroup>
      </FormSection>
      <FormSection number="5" title="Confirmation">
        <FieldSet>
          <FieldLegend className="sr-only">
            Nomination declaration and security verification
          </FieldLegend>
          <Controller
            control={form.control}
            name="declarationAccepted"
            render={({ field, fieldState }) => (
              <Field orientation="horizontal" data-invalid={fieldState.invalid}>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(checked) =>
                    field.onChange(checked === true)
                  }
                  aria-invalid={fieldState.invalid}
                  id="declaration"
                  disabled={busy}
                />
                <div>
                  <FieldLabel htmlFor="declaration" className="font-normal">
                    I confirm that the details provided are accurate and agree
                    to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="text-antique-gold underline"
                    >
                      terms of the nomination process
                    </a>
                  </FieldLabel>
                  <FieldError errors={[fieldState.error]} />
                </div>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="turnstileToken"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <Turnstile
                  onToken={field.onChange}
                  resetSignal={turnstileReset}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            className="absolute -left-[9999px]"
            aria-hidden
            {...form.register("honeypot")}
          />
        </FieldSet>
        {stage !== "idle" ? (
          <div className="mt-6" aria-live="polite">
            <div className="mb-2 flex justify-between text-sm">
              <span>
                {stage === "preparing"
                  ? "Preparing secure uploads…"
                  : stage === "uploading"
                    ? "Uploading files…"
                    : stage === "upload_failed"
                      ? "Some files need to be retried"
                      : stage === "completion_failed"
                        ? "Final confirmation needs to be retried"
                        : "Confirming your nomination…"}
              </span>
              <span>{stage === "uploading" ? `${overallProgress}%` : ""}</span>
            </div>
            <Progress
              value={
                stage === "preparing"
                  ? 5
                  : stage === "finalising"
                    ? 98
                    : overallProgress
              }
            />
          </div>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            type="submit"
            disabled={busy || unavailable}
            className="ceremonial-button h-12 flex-1 text-base font-semibold"
          >
            {busy ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : stage === "upload_failed" || stage === "completion_failed" ? (
              <RotateCcw data-icon="inline-start" />
            ) : null}
            {stage === "upload_failed"
              ? "Retry failed files"
              : stage === "completion_failed"
                ? "Retry final confirmation"
                : "Submit nomination"}
            <ArrowRight data-icon="inline-end" />
          </Button>
          {stage === "uploading" ? (
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => abortRef.current?.abort()}
            >
              <X data-icon="inline-start" />
              Cancel uploads
            </Button>
          ) : null}
          {stage === "completion_failed" ? (
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={beginFreshUploadSession}
            >
              Start a fresh upload
            </Button>
          ) : null}
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          <LockKeyhole aria-hidden /> Your information and files are transferred
          securely.
        </p>
      </FormSection>
    </form>
  );
}

function FormSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-mist px-5 py-7 last:border-b-0 md:px-8 md:py-9">
      <h2 className="section-title mb-6">
        <span className="mr-2 text-antique-gold">{number}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ControlledInput({
  form,
  name,
  label,
  description,
  required,
  inputMode,
}: {
  form: ReturnType<typeof useForm<PublicApplicationInput>>;
  name: keyof PublicApplicationInput;
  label: string;
  description?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>
            {label}{" "}
            {required ? (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            ) : null}
          </FieldLabel>
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          <Input
            {...field}
            value={typeof field.value === "string" ? field.value : ""}
            id={name}
            inputMode={inputMode}
            aria-invalid={fieldState.invalid}
            className="h-[50px] bg-white"
          />
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

function PhoneField({
  form,
}: {
  form: ReturnType<typeof useForm<PublicApplicationInput>>;
}) {
  const [country, setCountry] = useState<CountryCode>("LK");
  const countries = useMemo(() => {
    return getCountries()
      .map((code) => ({
        code,
        name: countryNames.getName(code, "en", { select: "official" }) ?? code,
        dial: getCountryCallingCode(code),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  return (
    <Controller
      control={form.control}
      name="phone"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor="phone">
            Phone Number{" "}
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </FieldLabel>
          <FieldDescription>
            Choose the country and enter a valid international number.
          </FieldDescription>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2">
            <select
              aria-label="Telephone country"
              value={country}
              onChange={(event) => {
                const next = event.target.value as CountryCode;
                const previousDial = `+${getCountryCallingCode(country)}`;
                const nextDial = `+${getCountryCallingCode(next)}`;
                setCountry(next);
                field.onChange(
                  typeof field.value === "string" &&
                    field.value.startsWith(previousDial)
                    ? field.value.replace(previousDial, nextDial)
                    : nextDial,
                );
              }}
              className="h-[50px] min-w-0 rounded-md border bg-white px-3 text-sm"
            >
              {countries.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name} (+{item.dial})
                </option>
              ))}
            </select>
            <Input
              {...field}
              id="phone"
              type="tel"
              inputMode="tel"
              value={typeof field.value === "string" ? field.value : ""}
              placeholder={`+${getCountryCallingCode(country)}`}
              aria-invalid={fieldState.invalid}
              className="h-[50px] bg-white"
            />
          </div>
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

function CategoryCombobox({
  categories,
  value,
  onValueChange,
  disabled,
  invalid,
}: {
  categories: Category[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((category) => category.id === value);
  return (
    <>
      <Button
        id="categoryId"
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-invalid={invalid}
        disabled={disabled}
        className="h-[50px] w-full justify-between bg-white px-3 text-left font-normal"
        onClick={() => setOpen(true)}
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected?.name ?? "Search and choose an award category"}
        </span>
        <ChevronsUpDown className="opacity-50" />
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Choose an award category"
        description="Search the active categories for this award cycle."
      >
        <Command>
          <CommandInput placeholder="Search award categories…" />
          <CommandList>
            <CommandEmpty>No category matches that search.</CommandEmpty>
            <CommandGroup heading="Active award categories">
              {categories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={category.name}
                  data-checked={category.id === value}
                  onSelect={() => {
                    onValueChange(category.id);
                    setOpen(false);
                  }}
                >
                  {category.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
