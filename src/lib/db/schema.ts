import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};
export const applicationStatus = pgEnum("application_status", [
  "uploading",
  "submitted",
  "under_review",
  "changes_requested",
  "resubmitted",
  "approved",
  "entry_confirmed",
  "shortlisted",
  "winner",
  "not_selected",
  "rejected",
  "withdrawn",
  "archived",
]);
export const paymentStatus = pgEnum("payment_status", [
  "proof_submitted",
  "under_review",
  "verified",
  "rejected",
  "waived",
  "refunded",
  "not_required",
]);
export const accountAccessStatus = pgEnum("account_access_status", [
  "not_created",
  "pending_invite",
  "invited",
  "active",
  "suspended",
  "revoked",
]);
export const cycleStatus = pgEnum("cycle_status", [
  "draft",
  "scheduled",
  "open",
  "closed",
  "reviewing",
  "results_pending",
  "completed",
  "archived",
]);
export const fileStatus = pgEnum("file_status", [
  "pending",
  "uploaded",
  "validating",
  "ready",
  "rejected",
  "superseded",
  "deleted",
]);
export const filePurpose = pgEnum("file_purpose", [
  "supporting_document",
  "payment_proof",
  "profile_original",
  "profile_512",
  "profile_96",
  "export",
  "brand",
  "requested_document",
  "other",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  ...timestamps,
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
});
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count")
      .notNull()
      .default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [
    index("two_factor_secret_idx").on(t.secret),
    index("two_factor_user_idx").on(t.userId),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucket: text("bucket", { enum: ["private", "public"] }).notNull(),
    objectKey: text("object_key").notNull().unique(),
    purpose: filePurpose("purpose").notNull(),
    status: fileStatus("status").notNull().default("pending"),
    sourceFileId: uuid("source_file_id").references(
      (): AnyPgColumn => files.id,
    ),
    originalFilename: text("original_filename"),
    safeDownloadFilename: text("safe_download_filename"),
    extension: text("extension"),
    mimeTypeClaimed: text("mime_type_claimed"),
    mimeTypeDetected: text("mime_type_detected"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    etag: text("etag"),
    sha256: text("sha256"),
    width: integer("width"),
    height: integer("height"),
    createdByProfileId: uuid("created_by_profile_id"),
    createdViaPublicSubmission: boolean("created_via_public_submission")
      .notNull()
      .default(false),
    validatedAt: timestamp("validated_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("files_purpose_status_idx").on(t.purpose, t.status),
    check("files_size_nonnegative", sql`${t.sizeBytes} >= 0`),
    check(
      "files_dimensions_positive",
      sql`(${t.width} is null or ${t.width} > 0) and (${t.height} is null or ${t.height} > 0)`,
    ),
  ],
);
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: text("auth_user_id")
    .notNull()
    .unique()
    .references(() => user.id),
  accountKind: text("account_kind", { enum: ["applicant", "staff"] }).notNull(),
  nomineeKind: text("nominee_kind", {
    enum: ["individual", "organisation", "unknown"],
  })
    .notNull()
    .default("unknown"),
  displayName: text("display_name").notNull(),
  officialName: text("official_name"),
  profileImageFileId: uuid("profile_image_file_id").references(() => files.id),
  designation: text("designation"),
  industrySector: text("industry_sector"),
  phoneE164: text("phone_e164"),
  phoneDisplay: text("phone_display"),
  alternateEmail: text("alternate_email"),
  businessWebsite: text("business_website"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  countryCode: char("country_code", { length: 2 }),
  shortBio: text("short_bio"),
  linkedinUrl: text("linkedin_url"),
  facebookUrl: text("facebook_url"),
  instagramUrl: text("instagram_url"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});
export const staffMemberships = pgTable("staff_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .unique()
    .references(() => profiles.id),
  role: text("role", {
    enum: ["super_admin", "admin", "reviewer", "finance", "support"],
  }).notNull(),
  permissions: jsonb("permissions").notNull().default({}),
  canViewAllApplications: boolean("can_view_all_applications")
    .notNull()
    .default(false),
  mfaRequired: boolean("mfa_required").notNull().default(true),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  ...timestamps,
});
export const awardCycles = pgTable(
  "award_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    year: integer("year").notNull(),
    status: cycleStatus("status").notNull().default("draft"),
    timezone: text("timezone").notNull().default("Asia/Colombo"),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    resultsReleaseAt: timestamp("results_release_at", { withTimezone: true }),
    supportEmail: text("support_email").notNull().default("info@gbeaward.com"),
    heading: text("heading").notNull(),
    introCopy: text("intro_copy").notNull(),
    nominationFeeMinor: bigint("nomination_fee_minor", { mode: "number" }),
    currency: char("currency", { length: 3 }),
    declarationText: text("declaration_text").notNull(),
    declarationVersion: text("declaration_version").notNull(),
    termsVersion: text("terms_version").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    formSchemaVersion: text("form_schema_version").notNull(),
    brandLogoFileId: uuid("brand_logo_file_id").references(() => files.id),
    settings: jsonb("settings").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    check("award_cycles_valid_window", sql`${t.closesAt} > ${t.opensAt}`),
    check(
      "award_cycles_fee_nonnegative",
      sql`${t.nominationFeeMinor} is null or ${t.nominationFeeMinor} >= 0`,
    ),
  ],
);
export const awardCategories = pgTable(
  "award_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => awardCycles.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortDescription: text("short_description"),
    internalNotes: text("internal_notes"),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    capacity: integer("capacity"),
    feeOverrideMinor: bigint("fee_override_minor", { mode: "number" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("categories_cycle_code_uidx").on(t.cycleId, t.code),
    uniqueIndex("categories_cycle_slug_uidx").on(t.cycleId, t.slug),
    check("categories_display_order_nonnegative", sql`${t.displayOrder} >= 0`),
    check(
      "categories_capacity_positive",
      sql`${t.capacity} is null or ${t.capacity} > 0`,
    ),
    check(
      "categories_fee_nonnegative",
      sql`${t.feeOverrideMinor} is null or ${t.feeOverrideMinor} >= 0`,
    ),
  ],
);
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: text("reference").unique(),
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => awardCycles.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => awardCategories.id),
    ownerProfileId: uuid("owner_profile_id").references(() => profiles.id),
    workflowStatus: applicationStatus("workflow_status")
      .notNull()
      .default("uploading"),
    paymentStatus: paymentStatus("payment_status")
      .notNull()
      .default("proof_submitted"),
    accountAccessStatus: accountAccessStatus("account_access_status")
      .notNull()
      .default("not_created"),
    nomineeName: text("nominee_name").notNull(),
    designation: text("designation"),
    industrySector: text("industry_sector").notNull(),
    businessWebsite: text("business_website"),
    emailNormalised: text("email_normalised").notNull(),
    emailDisplay: text("email_display").notNull(),
    phoneE164: text("phone_e164"),
    phoneDisplay: text("phone_display").notNull(),
    categoryNameSnapshot: text("category_name_snapshot").notNull(),
    categoryCodeSnapshot: text("category_code_snapshot").notNull(),
    declarationAccepted: boolean("declaration_accepted").notNull(),
    declarationTextSnapshot: text("declaration_text_snapshot").notNull(),
    declarationVersion: text("declaration_version").notNull(),
    termsVersion: text("terms_version").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    formSchemaVersion: text("form_schema_version").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    assignedReviewerId: uuid("assigned_reviewer_id").references(
      () => profiles.id,
    ),
    currentVersion: integer("current_version").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by"),
    ...timestamps,
  },
  (t) => [
    index("applications_cycle_status_submitted_idx").on(
      t.cycleId,
      t.workflowStatus,
      t.submittedAt,
      t.id,
    ),
    index("applications_payment_idx").on(t.paymentStatus),
    index("applications_reviewer_idx").on(t.assignedReviewerId),
    index("applications_category_idx").on(t.categoryId),
    index("applications_email_idx").on(t.emailNormalised),
    check("applications_version_nonnegative", sql`${t.currentVersion} >= 0`),
  ],
);
export const applicationVersions = pgTable(
  "application_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    version: integer("version").notNull(),
    source: text("source", {
      enum: [
        "public_submission",
        "applicant_resubmission",
        "staff_correction",
        "system",
      ],
    }).notNull(),
    payload: jsonb("payload").notNull(),
    changedFields: text("changed_fields")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    reason: text("reason"),
    createdByProfileId: uuid("created_by_profile_id").references(
      () => profiles.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("application_versions_number_uidx").on(
      t.applicationId,
      t.version,
    ),
  ],
);
export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id),
  publicTokenHash: text("public_token_hash").notNull().unique(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  expectedManifest: jsonb("expected_manifest").notNull(),
  status: text("status", {
    enum: ["initiated", "uploading", "completed", "expired", "failed"],
  }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  requestFingerprintHash: text("request_fingerprint_hash"),
  ...timestamps,
});
export const applicationFiles = pgTable("application_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id),
  kind: text("kind", {
    enum: ["supporting_document", "payment_proof", "requested_document"],
  }).notNull(),
  position: integer("position").notNull().default(0),
  isCurrent: boolean("is_current").notNull().default(true),
  replacesApplicationFileId: uuid("replaces_application_file_id"),
  uploadedByProfileId: uuid("uploaded_by_profile_id").references(
    () => profiles.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .unique()
      .references(() => applications.id),
    status: paymentStatus("status").notNull(),
    currency: char("currency", { length: 3 }),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    proofApplicationFileId: uuid("proof_application_file_id").references(
      () => applicationFiles.id,
    ),
    payerName: text("payer_name"),
    bankReference: text("bank_reference"),
    paymentReference: text("payment_reference").unique(),
    receiptReference: text("receipt_reference").unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    submittedNote: text("submitted_note"),
    financeNote: text("finance_note"),
    verifiedBy: uuid("verified_by").references(() => profiles.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    ...timestamps,
  },
  (t) => [
    check(
      "payments_amount_nonnegative",
      sql`${t.amountMinor} is null or ${t.amountMinor} >= 0`,
    ),
  ],
);
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorProfileId: uuid("actor_profile_id").references(() => profiles.id),
    actorType: text("actor_type", {
      enum: ["public", "applicant", "staff", "system"],
    }).notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    applicationId: uuid("application_id").references(() => applications.id),
    beforeRedacted: jsonb("before_redacted"),
    afterRedacted: jsonb("after_redacted"),
    reason: text("reason"),
    metadataRedacted: jsonb("metadata_redacted").notNull().default({}),
    ipHash: text("ip_hash"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_entity_created_idx").on(t.entityType, t.entityId, t.createdAt),
    index("audit_application_created_idx").on(t.applicationId, t.createdAt),
  ],
);
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateKey: text("template_key").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    recipientProfileId: uuid("recipient_profile_id").references(
      () => profiles.id,
    ),
    applicationId: uuid("application_id").references(() => applications.id),
    payload: jsonb("payload").notNull(),
    status: text("status", {
      enum: [
        "queued",
        "processing",
        "sent",
        "delivered",
        "bounced",
        "failed",
        "cancelled",
      ],
    })
      .notNull()
      .default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    providerMessageId: text("provider_message_id"),
    lastErrorCode: text("last_error_code"),
    lastErrorSummary: text("last_error_summary"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("email_outbox_queue_idx").on(t.status, t.nextAttemptAt)],
);
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailNormalised: text("email_normalised").notNull(),
  applicationId: uuid("application_id").references(() => applications.id),
  profileId: uuid("profile_id").references(() => profiles.id),
  type: text("type", { enum: ["applicant", "staff"] }).notNull(),
  status: text("status", {
    enum: ["pending", "sent", "accepted", "expired", "revoked", "failed"],
  }).notNull(),
  tokenHash: text("token_hash"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sendCount: integer("send_count").notNull().default(0),
  lastError: text("last_error"),
  createdBy: uuid("created_by").references(() => profiles.id),
  ...timestamps,
});
export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by")
    .notNull()
    .references(() => profiles.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const applicationRelations = relations(
  applications,
  ({ one, many }) => ({
    cycle: one(awardCycles, {
      fields: [applications.cycleId],
      references: [awardCycles.id],
    }),
    category: one(awardCategories, {
      fields: [applications.categoryId],
      references: [awardCategories.id],
    }),
    owner: one(profiles, {
      fields: [applications.ownerProfileId],
      references: [profiles.id],
    }),
    versions: many(applicationVersions),
    linkedFiles: many(applicationFiles),
  }),
);
export const cycleSequences = pgTable("cycle_sequences", {
  cycleId: uuid("cycle_id")
    .primaryKey()
    .references(() => awardCycles.id),
  nextApplicationNumber: integer("next_application_number")
    .notNull()
    .default(1),
  nextPaymentNumber: integer("next_payment_number").notNull().default(1),
  nextReceiptNumber: integer("next_receipt_number").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const applicationStatusHistory = pgTable("application_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id),
  fromStatus: applicationStatus("from_status"),
  toStatus: applicationStatus("to_status").notNull(),
  applicantLabel: text("applicant_label").notNull(),
  applicantMessage: text("applicant_message"),
  internalReason: text("internal_reason"),
  changedByProfileId: uuid("changed_by_profile_id").references(
    () => profiles.id,
  ),
  isSystemAction: boolean("is_system_action").notNull().default(false),
  effectiveAt: timestamp("effective_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const applicationChangeRequests = pgTable(
  "application_change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    fieldKeys: text("field_keys").array().notNull(),
    requestedFileKinds: text("requested_file_kinds").array().notNull(),
    instructions: text("instructions").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status", {
      enum: ["open", "completed", "cancelled"],
    }).notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => profiles.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
);
export const applicationFieldAccess = pgTable(
  "application_field_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    fieldKey: text("field_key").notNull(),
    state: text("state", {
      enum: ["locked", "applicant_editable", "admin_only"],
    }).notNull(),
    requestId: uuid("request_id").references(
      () => applicationChangeRequests.id,
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => profiles.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("field_access_application_key_uidx").on(
      t.applicationId,
      t.fieldKey,
    ),
  ],
);
export const applicationNotes = pgTable("application_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id),
  body: text("body").notNull(),
  noteType: text("note_type", {
    enum: ["general", "review", "finance", "security"],
  }).notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => profiles.id),
  isPinned: boolean("is_pinned").notNull().default(false),
  ...timestamps,
});
export const applicationMessages = pgTable(
  "application_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id),
    senderProfileId: uuid("sender_profile_id").references(() => profiles.id),
    senderType: text("sender_type", {
      enum: ["applicant", "staff", "system"],
    }).notNull(),
    visibility: text("visibility", {
      enum: ["applicant", "internal"],
    }).notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    parentMessageId: uuid("parent_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readByApplicantAt: timestamp("read_by_applicant_at", {
      withTimezone: true,
    }),
    readByStaffAt: timestamp("read_by_staff_at", { withTimezone: true }),
  },
  (t) => [
    index("messages_application_created_idx").on(t.applicationId, t.createdAt),
  ],
);
export const exportsTable = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => profiles.id),
  format: text("format", { enum: ["xlsx", "csv"] }).notNull(),
  reportKey: text("report_key").notNull(),
  querySnapshot: jsonb("query_snapshot").notNull(),
  idempotencyKey: text("idempotency_key").unique(),
  status: text("status", {
    enum: ["queued", "processing", "ready", "failed", "expired"],
  }).notNull(),
  fileId: uuid("file_id").references(() => files.id),
  rowCount: integer("row_count"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  errorSummary: text("error_summary"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobKey: text("job_key").notNull(),
    status: text("status", {
      enum: ["running", "succeeded", "failed"],
    }).notNull(),
    result: jsonb("result"),
    errorSummary: text("error_summary"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("job_runs_key_started_idx").on(t.jobKey, t.startedAt),
    index("job_runs_status_started_idx").on(t.status, t.startedAt),
  ],
);

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(1),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("rate_limit_buckets_reset_idx").on(t.resetAt)],
);
