"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronsUpDown,
  CreditCard,
  Landmark,
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
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useNominationPricing } from "./nomination-offer";
import { cardCheckoutAmount } from "@/lib/domain/card-checkout-amount";
import type { NominationPricing } from "@/lib/domain/nomination-pricing";
import {
  draftCredentialSchema,
  draftDataSchema,
  draftManifestSchema,
  type DraftCredential,
} from "@/lib/validation/nomination-draft";

type Category = { id: string; name: string };
type PaymentInstructions = {
  refundableIfNotAwarded?: boolean;
  standardFeeMinor?: number;
  cardPaymentUrl?: string;
  bankTransfer?: {
    accountName: string;
    bankName: string;
    accountNumber: string;
    branchName?: string;
    bankCode?: string;
    branchCode?: string;
  };
};
countryNames.registerLocale(englishCountryNames);
type UploadTarget = {
  id: string;
  url: string;
  headers: Record<string, string>;
};
type InitiatedData = {
  sessionToken: string;
  uploads: UploadTarget[];
  preparedFileIds?: string[];
  idempotencyKey?: string;
};
type InitiateResponse =
  | { ok: true; data: InitiatedData }
  | {
      ok: false;
      message: string;
      code?: string;
      pricing?: NominationPricing;
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

const FORM_STEPS = [
  { title: "Nominee", description: "Who you are nominating" },
  { title: "Contact", description: "Contact, category and documents" },
  { title: "Payment", description: "Choose your payment method" },
  { title: "Confirm", description: "Review and submit" },
] as const;

function formatFee(amountMinor?: number, currency?: string) {
  if (amountMinor === undefined || !currency) return null;
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function uploadFile(
  upload: SelectedUpload,
  target: UploadTarget,
  signal: AbortSignal,
  onProgress: (value: number) => void,
) {
  if (upload.savedSize !== undefined)
    return Promise.reject(
      new Error(
        "This saved file is no longer available. Remove it and select it again.",
      ),
    );
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
  cycleId,
  categories,
  unavailable,
  paymentInstructions,
  cardEnabled = false,
}: {
  cycleId?: string;
  categories: Category[];
  unavailable?: boolean;
  paymentInstructions?: PaymentInstructions;
  cardEnabled?: boolean;
}) {
  const { pricing, updatePricing } = useNominationPricing();
  const feeMinor = pricing.amountMinor ?? undefined;
  const currency = pricing.currency ?? undefined;
  const cardFeeMinor =
    feeMinor === undefined
      ? undefined
      : cardCheckoutAmount(feeMinor, currency ?? "LKR");
  const [acceptedAmountMinor, setAcceptedAmountMinor] = useState(feeMinor);
  const priceNeedsReview = acceptedAmountMinor !== feeMinor;
  const [supporting, setSupporting] = useState<SelectedUpload[]>([]);
  const [payment, setPayment] = useState<SelectedUpload[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "card">(
    "bank_transfer",
  );
  const [fileError, setFileError] = useState<string>();
  const [stage, setStage] = useState<SubmissionStage>("idle");
  const [reference, setReference] = useState("");
  const [session, setSession] = useState<InitiatedData | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [savingStep, setSavingStep] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const draftCredential = useRef<DraftCredential | null>(null);
  const draftVersion = useRef(0);
  const stepLock = useRef(false);
  const submitLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const submissionCompleteRef = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const form = useForm<PublicApplicationInput>({
    resolver: zodResolver(publicApplicationSchema),
    shouldFocusError: false,
    defaultValues: {
      nomineeName: "",
      designation: "",
      awardNomination: "",
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
    () => [
      ...supporting,
      ...(paymentMethod === "bank_transfer" ? payment : []),
    ],
    [supporting, payment, paymentMethod],
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
  const busy =
    savingStep ||
    restoring ||
    restoreFailed ||
    ["preparing", "uploading", "finalising"].includes(stage);
  const cardTest =
    paymentMethod === "card" &&
    cardFeeMinor !== undefined &&
    cardFeeMinor !== feeMinor;
  const fee = formatFee(
    paymentMethod === "card" ? (cardFeeMinor ?? feeMinor) : feeMinor,
    currency,
  );
  const standardFee = formatFee(
    (pricing.standardAmountMinor ??
      paymentInstructions?.standardFeeMinor ??
      0) > (feeMinor ?? 0)
      ? (pricing.standardAmountMinor ?? paymentInstructions?.standardFeeMinor)
      : undefined,
    currency,
  );

  useEffect(() => {
    if (currentStep === 0) return;
    stepHeadingRef.current?.focus();
  }, [currentStep]);

  useEffect(() => {
    if (!busy || restoreFailed) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!submissionCompleteRef.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, restoreFailed]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const stored = sessionStorage.getItem(`gbe-draft:${cycleId}`);
        if (!stored) return;
        const parsed = draftCredentialSchema.safeParse(JSON.parse(stored));
        if (!parsed.success) {
          sessionStorage.removeItem(`gbe-draft:${cycleId}`);
          return;
        }
        const credential = parsed.data;
        const response = await fetch("/api/public/drafts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "resume", credential }),
        });
        const result = await response.json();
        if (response.status === 404) {
          sessionStorage.removeItem(`gbe-draft:${cycleId}`);
          return;
        }
        if (!result.ok) throw new Error("Could not load saved form.");
        if (result.data.submitted || result.data.cycleId !== cycleId) {
          sessionStorage.removeItem(`gbe-draft:${cycleId}`);
          return;
        }
        if (cancelled) return;
        const values = draftDataSchema.parse(result.data.payload);
        const manifest = draftManifestSchema.parse(result.data.files);
        draftCredential.current = credential;
        draftVersion.current = result.data.version;
        for (const [key, value] of Object.entries(values)) {
          if (key === "paymentMethod") continue;
          form.setValue(key as keyof PublicApplicationInput, value);
        }
        setPaymentMethod(values.paymentMethod ?? "bank_transfer");
        const uploads: SelectedUpload[] = manifest.map((item) => ({
          id: item.id,
          kind: item.kind,
          file: new File([], item.name, { type: item.type }),
          savedSize: item.size,
          status: "uploaded",
          progress: 100,
        }));
        setSupporting(
          uploads.filter((file) => file.kind === "supporting_document"),
        );
        setPayment(uploads.filter((file) => file.kind === "payment_proof"));
        setCurrentStep(Math.min(result.data.step + 1, 3));
        if (result.data.pendingFiles > 0) {
          setCurrentStep(Math.min(result.data.step, 2));
          form.setError("root", {
            message:
              "Your details are restored. Choose any unfinished uploads again before continuing.",
          });
        }
      } catch {
        if (!cancelled) {
          setRestoreFailed(true);
          form.setError("root", {
            message:
              "Your saved form could not be loaded. Refresh to try again.",
          });
        }
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [cycleId, form]);

  function manifest() {
    return allFiles.map(({ id, file, kind, savedSize }) => ({
      id,
      name: file.name,
      size: savedSize ?? file.size,
      type: file.type,
      kind,
    }));
  }
  async function saveStep(step: number) {
    if (!cycleId) throw new Error("Nominations are not currently open.");
    if (!draftCredential.current) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      draftCredential.current = {
        id: crypto.randomUUID(),
        secret: Array.from(bytes, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      };
      try {
        sessionStorage.setItem(
          `gbe-draft:${cycleId}`,
          JSON.stringify(draftCredential.current),
        );
      } catch {
        /* In-memory retries still work if browser storage is disabled. */
      }
    }
    const values = form.getValues();
    const data = Object.fromEntries(
      Object.entries({
        nomineeName: values.nomineeName,
        designation: values.designation,
        businessWebsite: values.businessWebsite,
        email: values.email,
        phone: values.phone,
        categoryId: values.categoryId,
        awardNomination: values.awardNomination,
        ...(step >= 2 ? { paymentMethod } : {}),
      }).filter(([, value]) => value !== ""),
    );
    const response = await fetch("/api/public/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save",
        credential: draftCredential.current,
        cycleId,
        version: draftVersion.current,
        step,
        data,
        files: manifest(),
        turnstileToken: values.turnstileToken,
        startedAt,
        honeypot: values.honeypot,
      }),
    });
    const result = await response.json();
    if (!result.ok)
      throw new Error(
        result.message ?? "Could not save this step. Please retry.",
      );
    draftVersion.current = result.data.version;
    const controller = new AbortController();
    abortRef.current = controller;
    const outcomes = await Promise.allSettled(
      (result.data.uploads as UploadTarget[]).map(async (target) => {
        const file = allFiles.find((file) => file.id === target.id);
        if (!file) throw new Error("Select the missing file again.");
        updateFile(file.id, { status: "uploading", progress: 0 });
        try {
          await uploadFile(file, target, controller.signal, (progress) =>
            updateFile(file.id, { progress }),
          );
          updateFile(file.id, { status: "uploaded", progress: 100 });
        } catch (error) {
          updateFile(file.id, {
            status: "failed",
            error: "Upload failed. Retry this step.",
          });
          throw error;
        }
      }),
    );
    abortRef.current = null;
    if (outcomes.some((result) => result.status === "rejected"))
      throw new Error(
        "Some files could not be saved. Your details are saved; press Continue to retry.",
      );
    const confirmation = await fetch("/api/public/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "confirm",
        credential: draftCredential.current,
        version: draftVersion.current,
      }),
    });
    const confirmed = await confirmation.json();
    if (!confirmed.ok)
      throw new Error(
        confirmed.message ?? "Could not verify the saved files. Please retry.",
      );
  }

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
    if (submitLock.current || stepLock.current || restoring) return;
    if (priceNeedsReview) {
      setCurrentStep(2);
      return;
    }
    submitLock.current = true;
    submissionCompleteRef.current = false;
    if (paymentMethod === "bank_transfer" && payment.length !== 1) {
      setFileError("Choose one payment slip or screenshot.");
      errorSummaryRef.current?.focus();
      submitLock.current = false;
      return;
    }
    setFileError(undefined);
    form.clearErrors("root");
    let activeSession = session;
    try {
      if (!activeSession) {
        setStage("preparing");
        await saveStep(3);
        const response = await fetch("/api/public/applications/initiate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...values,
            acceptedAmountMinor,
            paymentMethod,
            draftCredential: draftCredential.current,
            files: manifest(),
          }),
        });
        const initiated = (await response.json()) as InitiateResponse;
        if (
          !initiated.ok &&
          initiated.code === "PRICE_CHANGED" &&
          initiated.pricing
        ) {
          updatePricing(initiated.pricing);
          setCurrentStep(2);
          setStage("idle");
          return;
        }
        if (!initiated.ok) throw new Error(initiated.message);
        activeSession = initiated.data;
        setSession(activeSession);
      }

      const pendingFiles = allFiles.filter(
        (file) =>
          file.status !== "uploaded" &&
          !activeSession!.preparedFileIds?.includes(file.id),
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
          idempotencyKey: activeSession.idempotencyKey ?? values.idempotencyKey,
          acceptedAmountMinor,
        }),
      });
      const result = (await complete.json()) as {
        ok: boolean;
        message?: string;
        code?: string;
        pricing?: NominationPricing;
        data?: { reference: string; paymentUrl?: string };
      };
      if (!result.ok && result.code === "PRICE_CHANGED" && result.pricing) {
        updatePricing(result.pricing);
        setCurrentStep(2);
        setStage("idle");
        return;
      }
      if (!result.ok || !result.data?.reference)
        throw new Error(result.message ?? "Final confirmation failed.");
      // The nomination is durable. Allow the intentional payment redirect
      // immediately, before React removes the upload-protection listener.
      submissionCompleteRef.current = true;
      try {
        sessionStorage.removeItem(`gbe-draft:${cycleId}`);
      } catch {
        /* Optional browser storage. */
      }
      if (result.data.paymentUrl) {
        window.location.assign(result.data.paymentUrl);
        return;
      }
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
    } finally {
      submitLock.current = false;
    }
  }

  function handleInvalid() {
    window.setTimeout(() => errorSummaryRef.current?.focus(), 0);
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    if (currentStep < FORM_STEPS.length - 1) {
      event.preventDefault();
      void moveToNextStep();
      return;
    }
    setFileError(
      paymentMethod === "card" || payment.length === 1
        ? undefined
        : "Choose one payment slip or screenshot.",
    );
    void form.handleSubmit(runSubmission, handleInvalid)(event);
  }

  async function moveToNextStep() {
    if (stepLock.current || busy || unavailable) return;
    stepLock.current = true;
    try {
      const fieldsByStep: Array<Array<keyof PublicApplicationInput>> = [
        ["nomineeName", "designation", "businessWebsite"],
        ["email", "phone", "categoryId", "awardNomination"],
        [],
        ["declarationAccepted", "turnstileToken"],
      ];
      const valid = await form.trigger(fieldsByStep[currentStep], {
        shouldFocus: true,
      });
      if (!valid) return;
      if (
        currentStep === 0 &&
        draftVersion.current === 0 &&
        !form.getValues("turnstileToken")
      ) {
        form.setError("root", {
          message: "Please complete the security verification.",
        });
        return;
      }
      if (
        currentStep === 2 &&
        paymentMethod === "bank_transfer" &&
        payment.length !== 1
      ) {
        setFileError("Choose one payment slip or screenshot.");
        errorSummaryRef.current?.focus();
        return;
      }
      setFileError(undefined);
      setSavingStep(true);
      form.clearErrors("root");
      await saveStep(currentStep);
      if (currentStep === 2) setAcceptedAmountMinor(feeMinor);
      if (session) beginFreshUploadSession();
      form.setValue("turnstileToken", "");
      setTurnstileReset((value) => value + 1);
      setCurrentStep((step) => Math.min(step + 1, FORM_STEPS.length - 1));
    } catch (error) {
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Could not save this step. Please retry.",
      });
      if (draftVersion.current === 0) {
        form.setValue("turnstileToken", "");
        setTurnstileReset((value) => value + 1);
      }
    } finally {
      stepLock.current = false;
      setSavingStep(false);
    }
  }
  const retry = () =>
    currentStep < 3
      ? void moveToNextStep()
      : void form.handleSubmit(runSubmission, handleInvalid)();
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
      <div className="border-b border-mist bg-white/55 px-5 py-5 md:px-8">
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span aria-live="polite">
            Step {currentStep + 1} of {FORM_STEPS.length}
          </span>
          <span>{FORM_STEPS[currentStep].description}</span>
        </div>
        <Progress
          value={((currentStep + 1) / FORM_STEPS.length) * 100}
          aria-label={`Nomination progress: step ${currentStep + 1} of ${FORM_STEPS.length}`}
        />
        <ol
          className="mt-4 grid grid-cols-4 gap-2"
          aria-label="Nomination steps"
        >
          {FORM_STEPS.map((step, index) => (
            <li
              key={step.title}
              aria-current={index === currentStep ? "step" : undefined}
              className={`truncate text-xs font-medium ${
                index <= currentStep
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <span className="hidden sm:inline">{index + 1}. </span>
              {step.title}
            </li>
          ))}
        </ol>
      </div>
      {priceNeedsReview ? (
        <div
          role="status"
          className="border-b border-mist bg-gold-wash px-5 py-4 text-sm leading-6 md:px-8"
        >
          <p>
            The offer ended. Fee:{" "}
            <strong>{formatFee(feeMinor, currency)}</strong>. Review your
            payment before submitting.
          </p>
          {currentStep === 3 ? (
            <Button
              type="button"
              variant="outline"
              className="mt-2 min-h-11"
              disabled={busy}
              onClick={() => setCurrentStep(2)}
            >
              Review fee
            </Button>
          ) : null}
        </div>
      ) : null}
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
            {restoreFailed ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Reload saved form
              </Button>
            ) : null}
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
      {currentStep === 0 ? (
        <FormSection
          headingRef={stepHeadingRef}
          number="1"
          title="Nominee details"
        >
          <FieldGroup>
            <ControlledInput
              form={form}
              name="nomineeName"
              label="Company Name / Full Name"
              required
            />
            <ControlledInput
              form={form}
              name="designation"
              label="Designation"
              description="Complete this only when nominating an individual."
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
      ) : null}
      {currentStep === 1 ? (
        <FormSection
          headingRef={stepHeadingRef}
          number="2"
          title="Contact and category"
        >
          <FieldGroup>
            <ControlledInput
              form={form}
              name="email"
              label="Email Address"
              required
              inputMode="email"
            />
            <PhoneField form={form} />
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="categoryId">
                    Award category{" "}
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
            <Controller
              control={form.control}
              name="awardNomination"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="awardNomination">
                    Award nomination{" "}
                    <span aria-hidden className="text-destructive">
                      *
                    </span>
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="awardNomination"
                    required
                    aria-invalid={fieldState.invalid}
                    className="min-h-28 bg-white"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Field>
              <FieldLabel>Supporting documents</FieldLabel>
              <FieldDescription>
                Optional · add up to five files that strengthen the nomination.
                Each file can be up to 5 MB.
              </FieldDescription>
              <FilePicker
                kind="supporting_document"
                files={supporting}
                onChange={(files) => changeFiles("supporting_document", files)}
                disabled={busy}
                onRetry={retry}
              />
            </Field>
          </FieldGroup>
        </FormSection>
      ) : null}
      {currentStep === 2 ? (
        <FormSection headingRef={stepHeadingRef} number="3" title="Payment">
          <FieldGroup>
            <div className="rounded-md border border-champagne/50 bg-gold-wash/55 p-4 text-sm text-graphite">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-medium text-foreground">
                  {cardTest ? "Card test payment" : "Application fee"}
                </p>
                <div className="flex items-baseline gap-2">
                  {standardFee && !cardTest ? (
                    <span className="text-sm text-muted-foreground line-through">
                      {standardFee}
                    </span>
                  ) : null}
                  {fee ? (
                    <span className="text-lg font-semibold text-foreground">
                      {fee}
                    </span>
                  ) : null}
                </div>
              </div>
              {standardFee && !cardTest ? (
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-antique-gold">
                  Limited offer
                </p>
              ) : null}
              {cardTest ? (
                <p className="mt-2 leading-6">
                  Temporary card checkout test amount. Bank transfer remains at{" "}
                  {formatFee(feeMinor, currency)}.
                </p>
              ) : (
                <p className="mt-2 leading-6">
                  Covers nomination processing and document verification.
                  {paymentInstructions?.refundableIfNotAwarded
                    ? " Fully refundable if the nominee is not awarded."
                    : ""}
                </p>
              )}
              <div className="mt-4 border-t border-champagne/40 pt-4">
                <fieldset className="mb-4 grid gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Payment method</legend>
                  {[
                    ...(cardEnabled ? ["card" as const] : []),
                    "bank_transfer" as const,
                  ].map((method) => (
                    <label
                      key={method}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-4 ${paymentMethod === method ? "border-antique-gold" : "border-mist"}`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        checked={paymentMethod === method}
                        disabled={busy}
                        onChange={() => {
                          if (session) beginFreshUploadSession();
                          setPaymentMethod(method);
                          setFileError(undefined);
                        }}
                      />
                      {method === "card" ? (
                        <CreditCard aria-hidden className="size-4" />
                      ) : (
                        <Landmark aria-hidden className="size-4" />
                      )}
                      <span>
                        {method === "card" ? "Pay by card" : "Bank transfer"}
                      </span>
                    </label>
                  ))}
                </fieldset>
                {paymentMethod === "card" ? (
                  <p className="text-sm">
                    Secure checkout follows submission. No payment slip needed.
                  </p>
                ) : (
                  <PaymentMethodDialog
                    paymentInstructions={paymentInstructions}
                  />
                )}
              </div>
            </div>
            {paymentMethod === "bank_transfer" ? (
              <Field data-invalid={Boolean(fileError)}>
                <FieldLabel>
                  Payment proof{" "}
                  <span aria-hidden className="text-destructive">
                    *
                  </span>
                </FieldLabel>
                <FieldDescription>
                  After paying by bank transfer, add one payment slip, receipt
                  or screenshot. Maximum 5 MB.
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
            ) : null}
          </FieldGroup>
        </FormSection>
      ) : null}
      {currentStep === 3 ? (
        <FormSection
          headingRef={stepHeadingRef}
          number="4"
          title="Confirm and submit"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {paymentMethod === "card" ? "Card payment" : "Bank transfer"}
            </span>
            <span className="font-semibold">{fee}</span>
          </div>
          <FieldSet>
            <FieldLegend className="sr-only">
              Nomination declaration and security verification
            </FieldLegend>
            <Controller
              control={form.control}
              name="declarationAccepted"
              render={({ field, fieldState }) => (
                <Field
                  orientation="horizontal"
                  data-invalid={fieldState.invalid}
                >
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
                <span>
                  {stage === "uploading" ? `${overallProgress}%` : ""}
                </span>
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
            {!busy ? (
              <Button
                type="button"
                variant="ghost"
                className="h-12"
                onClick={() => setCurrentStep(2)}
              >
                <ArrowLeft data-icon="inline-start" />
                Back
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={busy || unavailable}
              className="ceremonial-button h-auto min-h-14 flex-none gap-3 whitespace-normal px-6 py-3 text-base font-semibold leading-6 sm:flex-1"
            >
              {busy ? (
                <LoaderCircle
                  className="animate-spin"
                  data-icon="inline-start"
                />
              ) : stage === "upload_failed" || stage === "completion_failed" ? (
                <RotateCcw data-icon="inline-start" />
              ) : null}
              {stage === "upload_failed"
                ? "Retry failed files"
                : stage === "completion_failed"
                  ? "Retry final confirmation"
                  : paymentMethod === "card"
                    ? "Continue to payment"
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
            <LockKeyhole aria-hidden /> Your information and files are
            transferred securely.
          </p>
        </FormSection>
      ) : null}
      {currentStep === 0 && draftVersion.current === 0 ? (
        <div className="px-5 pb-4 md:px-8">
          <Turnstile
            onToken={(token) => form.setValue("turnstileToken", token)}
            resetSignal={turnstileReset}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Progress saves as you continue.{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Privacy notice
            </a>
          </p>
        </div>
      ) : null}
      {currentStep < FORM_STEPS.length - 1 ? (
        <div className="flex flex-col-reverse gap-3 border-t border-mist bg-white/45 px-5 py-5 sm:flex-row sm:justify-between md:px-8">
          {currentStep > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              disabled={busy}
              onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
            >
              <ArrowLeft data-icon="inline-start" />
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            className="h-11"
            disabled={unavailable || busy}
            onClick={() => void moveToNextStep()}
          >
            {savingStep || restoring ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : null}
            {savingStep ? "Saving" : restoring ? "Loading" : "Continue"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function PaymentMethodDialog({
  paymentInstructions,
}: {
  paymentInstructions?: PaymentInstructions;
}) {
  const bankTransfer = paymentInstructions?.bankTransfer;
  if (!bankTransfer)
    return (
      <p className="text-sm text-muted-foreground">
        Payment instructions will be provided by the GBE Awards team.
      </p>
    );
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            className="h-auto min-h-14 w-full gap-3 whitespace-normal px-5 py-3 text-base font-semibold leading-6"
          />
        }
      >
        <Landmark aria-hidden className="size-5" />
        View bank account details
        <ArrowRight aria-hidden className="size-5" />
      </DialogTrigger>
      <DialogContent className="gap-5 p-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bank transfer</DialogTitle>
          <DialogDescription>
            Use the bank-transfer details below. When payment is complete,
            return here and upload one receipt, slip or screenshot.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {bankTransfer ? (
            <div className="rounded-md border border-mist bg-white p-4">
              <div className="flex gap-3">
                <Landmark
                  className="mt-0.5 size-5 shrink-0 text-antique-gold"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Bank transfer</p>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                    <PaymentDetail label="Account name">
                      {bankTransfer.accountName}
                    </PaymentDetail>
                    <PaymentDetail label="Bank">
                      {bankTransfer.bankName}
                    </PaymentDetail>
                    <PaymentDetail label="Account number" mono>
                      {bankTransfer.accountNumber}
                    </PaymentDetail>
                    {bankTransfer.branchName ? (
                      <PaymentDetail label="Branch">
                        {bankTransfer.branchName}
                      </PaymentDetail>
                    ) : null}
                    {bankTransfer.bankCode ? (
                      <PaymentDetail label="Bank code" mono>
                        {bankTransfer.bankCode}
                      </PaymentDetail>
                    ) : null}
                    {bankTransfer.branchCode ? (
                      <PaymentDetail label="Branch code" mono>
                        {bankTransfer.branchCode}
                      </PaymentDetail>
                    ) : null}
                  </dl>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function PaymentDetail({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          mono
            ? "font-mono font-medium text-foreground"
            : "font-medium text-foreground"
        }
      >
        {children}
      </dd>
    </div>
  );
}

function FormSection({
  headingRef,
  number,
  title,
  children,
}: {
  headingRef?: React.Ref<HTMLHeadingElement>;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-mist px-5 py-7 last:border-b-0 md:px-8 md:py-9">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="section-title mb-6 outline-none"
      >
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
            Choose the country, then enter the number without its country code.
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
              id="phone"
              type="tel"
              inputMode="tel"
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={
                typeof field.value === "string" &&
                field.value.startsWith(`+${getCountryCallingCode(country)}`)
                  ? field.value.slice(
                      `+${getCountryCallingCode(country)}`.length,
                    )
                  : typeof field.value === "string"
                    ? field.value
                    : ""
              }
              onChange={(event) => {
                const raw = event.target.value.trim();
                if (raw.startsWith("+")) {
                  field.onChange(raw);
                  return;
                }
                const local = raw.replace(/^0+/, "");
                field.onChange(
                  local ? `+${getCountryCallingCode(country)}${local}` : "",
                );
              }}
              placeholder="77 123 4567"
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
