# GBE Awards Portal — Product & Technical Specification

**Product:** Global Business Excellence Awards Portal  
**Primary domain:** `https://portal.gbeawards.com`  
**Initial award cycle:** GBE Awards 2026  
**Document:** `SPEC.md`  
**Specification version:** 2.0 — Final  
**Status:** Final development baseline  
**Language:** English (United Kingdom)  
**Official website:** `https://gbeaward.com`  
**Support email:** `info@gbeaward.com`  
**Primary timezone:** Asia/Colombo (`UTC+05:30`)  
**Visual mode:** Light mode only  
**Data platform:** Neon PostgreSQL  
**File platform:** Cloudflare R2  

---

## Contents

- **Product foundation:** Sections 1–10 — purpose, vision, scope, roles, journeys, routes, cycles, forms and statuses.
- **UX and visual system:** Sections 11–15 — art direction, colours, typography, glassmorphism, components, responsive behaviour and accessibility.
- **Technical architecture:** Sections 16–21 — stack, repository architecture, authentication, database, RLS and server operations.
- **Communications and operations:** Sections 22–29 — email, payments, admin, applicant portal, security, privacy, analytics and logging.
- **Quality and deployment:** Sections 30–37 — performance, SEO, testing, environments, configuration, scripts, flags and jobs.
- **Delivery controls:** Sections 38–49 — numbering, validation, states, phases, definition of done, acceptance criteria, agent rules, future scope, design tokens and references.

---

## 1. Purpose of This Specification

This document is the authoritative product, UX, design-system, data, architecture, security and engineering specification for the GBE Awards Portal. It must be sufficient for an engineering agent or development team to design, build, test and deploy the production portal without inventing core behaviour.

The final product must provide:

1. A single-page, minimal public nomination form at `/apply` containing only the approved fields defined in Section 9.
2. Cloudflare Turnstile protection and rate limiting on the public nomination submission.
3. Direct, private uploads to Cloudflare R2 for supporting documents, payment proof, profile images, exports and every other runtime-managed file.
4. A Neon PostgreSQL database containing all portal, application, account, workflow, communication and audit data.
5. An approval-first account model. Public submission does not create a login. After an administrator approves the nomination, the system creates or links an applicant account and emails secure activation access.
6. A private applicant portal where approved applicants can see status, payment verification, messages and documents; edit permitted profile information; and respond to specifically unlocked requests while protected application fields remain locked.
7. A complete but uncluttered administration portal for reviewing, correcting, approving, rejecting, assigning, messaging, exporting and managing all relevant data.
8. Production-quality frontend and backend pagination, filtering, sorting, search, caching, upload progress, transitions, accessibility, security, auditability and error handling.
9. A reusable award-cycle foundation so future editions can be opened without rebuilding the system.
10. A distinctive luxury light-mode interface in which glassmorphism is a deliberate, controlled UX material rather than a decorative effect applied everywhere.

The portal must feel like a private awards concierge: prestigious, calm, clear and effortless. It must not feel like a generic template, government form, rough internal dashboard or colourful startup product.

## 2. Product Vision

### 2.1 Product statement

The GBE Awards Portal is the single trusted digital workspace through which organisations and individuals submit award applications, receive official decisions, complete entry requirements and follow their journey through the GBE Awards process.

### 2.2 Experience promise

Every user should immediately understand:

- where they are;
- what has been completed;
- what must happen next;
- whether any action is required;
- what their official application status is; and
- where to obtain help.

### 2.3 Experience principles

1. **Quiet luxury, not decorative excess** — prestige must come from proportion, typography, spacing, material treatment and detail.
2. **One clear action at a time** — each page should have one dominant primary action.
3. **Progress must always be visible** — applicants should never wonder whether their work was saved or submitted.
4. **Plain language over system language** — internal workflow names must be translated into reassuring applicant-facing labels.
5. **Approval creates membership** — portal access should feel like a meaningful next stage, not merely another login.
6. **Administrative speed** — the admin area should reduce repeated clicks, avoid modal overload and make status decisions obvious.
7. **Configuration over hard-coding** — award cycles, dates, categories, fees, requirements and key copy must be configurable.
8. **Security by default** — private files, account access and role permissions must be enforced server-side and at database level.
9. **Mobile first for applicants, desktop optimised for staff**.
10. **No visual noise** — charts, cards, badges and animation must exist only when they improve understanding.

---

## 3. Scope

### 3.1 Release 1 scope

Release 1 must include:

- a public `/apply` page with the exact minimal nomination fields in Section 9;
- a single-page form, not a long wizard;
- server-generated Colombo submission timestamp;
- Cloudflare Turnstile with mandatory server-side verification;
- payment-proof upload as part of the initial nomination;
- optional supporting uploads, up to five files;
- direct-to-R2 uploads using short-lived presigned URLs;
- upload progress, retry, cancellation and failed-upload recovery;
- server-side file count, size, MIME and signature validation;
- a submission confirmation page and confirmation email;
- application reference generation;
- admin authentication and role-based access;
- an operational admin dashboard;
- applications table with server-side search, filters, sorting, pagination and URL-preserved state;
- complete application detail and review pages;
- status transitions, assignment, notes, messages and immutable audit history;
- payment-proof review and verification;
- approval, rejection, information requests, resubmission and outcome management;
- secure applicant account creation or linking only after approval;
- applicant activation, login, password recovery and profile management;
- editable applicant profile fields and clearly locked application fields;
- profile-picture upload, crop and optimised variants in R2;
- applicant dashboard, application view, documents, payment, messages, profile and security pages;
- controlled field unlocks for requested applicant changes;
- admin editing of operational data with mandatory reasons and audit records;
- staff, role and permission management;
- category, cycle, email-template and system-setting management;
- Excel `.xlsx` and CSV exports;
- private export files in R2 with expiry and access control;
- Resend transactional email with an outbox and retry mechanism;
- Neon PostgreSQL migrations, indexes, backups and environment separation;
- responsive layouts, WCAG 2.2 AA target and polished motion;
- automated tests for critical journeys;
- Vercel deployment, Cloudflare DNS/R2/Turnstile, Neon and Resend configuration;
- structured logging and operational visibility without Sentry.

### 3.2 Explicitly not in Release 1

The following must not delay the first production release:

- public user registration;
- a large multi-step public application questionnaire;
- public nominee profiles or public voting;
- a full judging and scoring portal;
- online card payment processing;
- native mobile applications;
- multilingual UI;
- AI-generated decisions;
- live-event check-in or seating;
- certificate and trophy fulfilment;
- WhatsApp automation;
- drag-and-drop form building;
- real-time chat;
- Sentry.

The schema may remain compatible with future judging, scoring, certificates, public nominee pages and online payments, but those features must not add unnecessary complexity to Release 1.

## 4. Success Measures

### 4.1 Public nomination experience

- The form contains only the approved fields and can be understood without instructions from staff.
- A valid nomination can be submitted comfortably on mobile from a 360px-wide viewport.
- Turnstile, uploads and finalisation produce one clear, recoverable flow.
- The user always knows whether files are selected, uploading, uploaded or failed.
- Duplicate clicks or retries cannot create duplicate final submissions.
- The user receives an on-screen reference and confirmation email after successful finalisation.

### 4.2 Applicant experience

- The current application status and next action appear in the first viewport.
- Profile edits feel immediate and preserve data safely.
- Locked fields are visibly locked and explain why.
- Applicants can complete requested changes without contacting support for technical help.
- All support surfaces display `info@gbeaward.com`.

### 4.3 Administrative experience

- Staff can locate a known application within 10 seconds by reference, name, company, email or telephone.
- Every list supports backend pagination and retains filters in the URL.
- A standard review can be completed from one application detail page.
- Authorised staff can correct required data without direct database access.
- Every consequential mutation has an actor, timestamp, before/after context and reason where applicable.
- A filtered Excel or CSV export can be created without engineering assistance.

### 4.4 Technical quality

- No applicant can access another applicant's record or file.
- No R2, Neon, Resend or Better Auth privileged secret reaches browser code.
- Private files are never exposed through permanent public URLs.
- Public submission, invitation acceptance and admin status changes are idempotent.
- Critical Playwright journeys pass before deployment.
- Public pages meet good Core Web Vitals on representative production devices.
- All production mutations validate data server-side with Zod.

## 5. Users, Roles and Permission Model

### 5.1 Public nominator

Can:

- open `/apply`;
- submit one nomination using the exact public form;
- upload supporting documents and payment proof;
- accept the nomination declaration;
- receive a confirmation email.

Cannot:

- create a public account;
- log in before approval;
- edit a final submission unless GBE sends a secure request or later activates the applicant account;
- view internal review information.

### 5.2 Applicant

An applicant is created or linked only after approval.

Can:

- sign in to the applicant portal;
- view all applications explicitly linked to the account;
- see applicant-facing status, payment state, next actions and key dates;
- edit permitted profile fields;
- upload or replace a profile picture;
- read messages and send replies;
- download authorised files and application summaries;
- update only the application fields specifically unlocked by staff;
- upload requested replacement evidence or payment proof;
- manage password and personal sessions.

Cannot:

- change the original submission reference or timestamp;
- directly change category, workflow status, payment-verification status or outcome;
- delete original submitted files;
- view internal notes, hidden reasons, staff identities where not appropriate or audit metadata;
- change the primary login email through an ordinary profile form.

### 5.3 Reviewer

Can:

- access assigned applications or all applications when permission allows;
- review form data and files;
- add internal notes;
- request information or corrections;
- recommend or perform permitted status transitions;
- send applicant-visible messages;
- export records only when the export permission is granted.

Cannot manage staff, global settings or payment verification unless separately permitted.

### 5.4 Finance

Can:

- view identity and application information needed for reconciliation;
- view payment evidence;
- verify, reject, waive or reverse a payment state according to permission;
- add finance-only notes;
- create payment reconciliation exports.

### 5.5 Administrator

Can perform normal operational administration, including:

- view and edit applications;
- change permitted statuses;
- assign reviewers;
- manage applicants and accounts;
- resend invitations;
- manage files and payment proofs;
- send communications;
- manage categories and cycle content;
- generate authorised exports;
- view audit history.

Any edit to submitted application information must require a reason and create a version plus audit event.

### 5.6 Super administrator

Has all authorised capabilities plus:

- staff invitations and role management;
- permission configuration;
- production cycle activation;
- system settings and email templates;
- exceptional account corrections;
- soft-delete restoration and approved retention actions;
- elevated backward status transitions;
- export-policy configuration.

### 5.7 Authentication policy

- Applicant accounts: invitation only after application approval.
- Staff accounts: invitation only.
- Public sign-up: disabled at the authentication provider and absent from the UI.
- Applicants: email and password.
- Staff: email and password plus mandatory TOTP MFA.
- Password reset responses must not reveal whether an email exists.
- Deactivated users must lose access on the next request, not merely after session expiry.

## 6. Core User Journeys

### 6.1 Public nomination journey

1. Visitor opens `/apply`.
2. The page presents a concise title, one short explanation, support contact and the single form.
3. Visitor completes the fields defined in Section 9.
4. Visitor selects up to five optional supporting files and one required payment-proof file.
5. The UI validates field shape, file count, extension and apparent size before submission.
6. Visitor accepts the exact declaration and completes Turnstile.
7. On submit, the client sends validated metadata, declaration version, file manifest, idempotency key and Turnstile token to `POST /api/public/applications/initiate`.
8. The server validates Turnstile, origin, rate limit, field data and manifest; creates a provisional `uploading` application; and returns short-lived R2 presigned PUT URLs.
9. The browser uploads files directly to private R2 with individual progress and retry controls.
10. The client calls `POST /api/public/applications/complete` with the upload-session token and uploaded object metadata.
11. The server confirms each object with R2 HEAD, validates size/type expectations, records files, creates the immutable first submission version and finalises status as `submitted` in one idempotent transaction.
12. The server creates the application reference, stores the UTC timestamp, prepares Colombo display values, queues the confirmation email and returns the success response.
13. The visitor sees the reference and receives a confirmation email.
14. No account is created at this stage.

If any upload fails, the user remains on the form with completed uploads preserved for the short upload-session lifetime and can retry only the failed file. Provisional submissions and orphaned objects expire through scheduled cleanup.

### 6.2 Administrative review journey

1. Reviewer opens `/admin/applications`.
2. Filters and search are applied server-side and preserved in the URL.
3. Reviewer opens the detail page or an optional read-only quick preview.
4. Reviewer checks submitted data, payment proof and supporting files.
5. Reviewer may assign, add notes, edit data with a reason, request information, approve or reject.
6. The central transition service validates role, state and required fields.
7. Status history, audit event and email-outbox item are created consistently.
8. The list and dashboard update without a full-page disruption.

### 6.3 Approval and account activation journey

1. Authorised staff selects **Approve application**.
2. The system verifies that the application is in an approvable state.
3. Status becomes `approved`.
4. If the email already belongs to an active applicant, the application is linked to that profile.
5. Otherwise the server creates an invitation record, creates a Better Auth user through a privileged server-only workflow with public sign-up disabled, and generates a single-use account-activation/password-setup link.
6. A branded email is sent from the verified GBE domain with `info@gbeaward.com` as the reply contact.
7. The applicant opens the link, chooses a password and activates the account.
8. The invitation is marked accepted, the profile is seeded from the approved application and ownership is linked.
9. The applicant enters `/portal` and sees the approved application.
10. Expired invitations can be resent by staff; only the newest invitation remains valid.

### 6.4 Applicant profile journey

1. Applicant opens `/portal/profile`.
2. Editable fields are presented as normal controls; locked official fields use a calm locked treatment with explanatory text.
3. Applicant may upload a profile picture or company logo.
4. The browser presents crop/position preview where appropriate.
5. The original uploads directly to private R2; the server validates it and creates optimised 512px and 96px WebP variants.
6. A successful mutation updates the UI optimistically only after the server has accepted the final object.
7. All changes are audited at profile level.

### 6.5 Information-request journey

1. Staff selects **Request information**.
2. Staff selects exact editable field keys and/or requested document types and writes applicant-facing instructions.
3. Status becomes `changes_requested`.
4. The account dashboard displays an action card and deadline if supplied.
5. Only selected fields become editable.
6. Applicant updates and submits the requested changes.
7. The system creates a new application version, locks the fields again and changes status to `resubmitted`.
8. Previous values remain visible to authorised staff in version history.

### 6.6 Administrative correction journey

1. Authorised staff chooses **Edit application data**.
2. The UI displays current values and identifies fields sourced from the original submission.
3. Staff changes any permitted field and enters a mandatory reason.
4. The system validates the change, creates a complete new version or field-level before/after record, updates current values and writes an audit event.
5. Sensitive identity or primary-email changes require elevated permission and may require account relinking.
6. The original submission version is never destroyed.

### 6.7 Payment-proof journey

1. Payment proof is submitted with the initial nomination.
2. Payment status begins as `proof_submitted`.
3. Finance opens the payment review queue and views the private proof through a short-lived authorised URL.
4. Finance marks it `verified`, `rejected`, `waived` or another permitted state and records a note where required.
5. If rejected, the applicant receives instructions and can upload one replacement through the portal.
6. Prior proof remains retained for authorised history but is no longer current.

### 6.8 Export journey

1. Staff applies filters in an admin list or report page.
2. Staff chooses current view, selected records or a named report and selects Excel or CSV.
3. The backend re-runs the authorised query; it does not trust row data supplied by the browser.
4. The export is generated with Colombo-formatted dates, stored privately in R2 and recorded in `exports`.
5. The staff member receives a short-lived download action.
6. Export creation and download are audited; the file expires automatically.

### 6.9 Outcome journey

Authorised staff may move confirmed applications to `shortlisted`, `winner` or `not_selected`. Applicant-visible release can be immediate or scheduled by cycle settings. Winner treatment must be elegant and ceremonial but not visually excessive.

## 7. Information Architecture and Routes

### 7.1 Public routes

```text
/
  Redirect to /apply or display a minimal portal gateway
/apply
/apply/submitted
/privacy
/terms
/help
```

`/apply` is one page. Do not create a public multi-step route tree.

### 7.2 Authentication routes

```text
/login
/auth/accept-invite
/auth/forgot-password
/auth/reset-password
/auth/two-factor
/api/auth/[...all]
```

There is no public sign-up route.

### 7.3 Applicant portal routes

```text
/portal
/portal/applications
/portal/applications/[applicationId]
/portal/applications/[applicationId]/documents
/portal/applications/[applicationId]/payment
/portal/applications/[applicationId]/messages
/portal/profile
/portal/security
/portal/help
```

### 7.4 Administration routes

```text
/admin/login
/admin
/admin/applications
/admin/applications/[applicationId]
/admin/applicants
/admin/applicants/[profileId]
/admin/payments
/admin/files
/admin/communications
/admin/exports
/admin/reports
/admin/categories
/admin/cycles
/admin/staff
/admin/settings
/admin/activity
```

### 7.5 API and infrastructure routes

```text
POST /api/public/applications/initiate
POST /api/public/applications/complete
POST /api/uploads/profile/presign
POST /api/uploads/profile/complete
POST /api/uploads/requested-document/presign
POST /api/uploads/requested-document/complete
GET  /api/files/[fileId]/download
GET  /api/admin/applications
POST /api/admin/exports
GET  /api/admin/exports/[exportId]/download
POST /api/webhooks/resend
GET  /api/cron/email-outbox
GET  /api/cron/cleanup-uploads
GET  /api/cron/cleanup-exports
```

### 7.6 Route-group structure

```text
src/app/
  (public)/
  (auth)/
  (portal)/
  (admin)/
  api/
```

Layouts enforce visual shells and coarse authentication boundaries. `proxy.ts` may perform coarse session checks, but every read and mutation must repeat authorisation in the server data-access layer.

## 8. Award-Cycle and Category Model

### 8.1 Award cycles

GBE Awards 2026 must be a database record rather than a year hard-coded throughout the application.

Each cycle defines:

- name, slug and year;
- lifecycle status;
- applications opening and closing date/time;
- timezone, fixed to `Asia/Colombo` by default;
- support email, default `info@gbeaward.com`;
- public heading, explanatory copy and terms links;
- declaration text and version;
- nomination fee and currency where applicable;
- bank/payment instructions managed outside the public field set;
- result-release date/time where known;
- active categories;
- logo and brand-asset references in public R2;
- feature flags;
- retention policy.

Cycle statuses:

```text
draft
scheduled
open
closed
reviewing
results_pending
completed
archived
```

### 8.2 Categories

Each category belongs to one cycle and supports:

- name;
- stable code and slug;
- short description;
- internal notes;
- display order;
- active/inactive state;
- optional capacity;
- optional fee override;
- created and updated audit fields.

The public form displays only active categories for the current open cycle. Release 1 has no category-specific public questionnaire.

### 8.3 Configuration versioning

The minimal public field set is fixed by this specification. The system must nevertheless snapshot:

- cycle ID;
- category ID and category name at submission;
- declaration text/version;
- terms/privacy versions;
- form schema version;
- relevant fee/currency values.

Published historical records must render using their captured snapshot even if administrators later rename a category or update cycle copy.

## 9. Public Nomination Form Specification

### 9.1 Product rule

The initial nomination form must be intentionally minimal. It is a single-page form and must contain no extra applicant questions beyond those listed below. Richer profile details are collected only after approval inside the applicant account.

The visual page may group controls into subtle sections, but it must not behave like a long wizard and must not show an unnecessary progress stepper.

### 9.2 Exact fields

#### 1. Timestamp

- Not an editable input.
- Generated by the server at successful final submission.
- Stored as UTC `timestamptz`.
- Displayed and exported in `Asia/Colombo`, UTC+05:30.
- Excel format example: `2026-07-11 14:35:22 +05:30`.

#### 2. Full Name / Company Name

- Required.
- Text, trimmed.
- 2–180 characters.
- Preserve intended capitalisation.
- Database field: `nominee_name`.

#### 3. Designation (if an individual nominee)

- Optional.
- Text, trimmed.
- Maximum 120 characters.
- Database field: `designation`.
- Helper text: `Complete this only when nominating an individual.`

#### 4. Industry / Business Sector

- Required.
- Searchable combobox with common sectors plus **Other** free-text support, or a straightforward text control when the category list is not final.
- Maximum 160 characters.
- Database field: `industry_sector`.

#### 5. Business Website (if applicable)

- Optional.
- Accept a valid `http` or `https` URL.
- If the user enters a domain without a scheme, normalise safely to `https://` after validation.
- Maximum 500 characters.
- Database field: `business_website`.

#### 6. Email Address

- Required.
- Normalise by trim and lowercase for matching while preserving the submitted display value where useful.
- Maximum 320 characters.
- Database field: `email`.
- This becomes the proposed applicant login email after approval unless an authorised administrator corrects it.

#### 7. Phone Number

- Required.
- International telephone input with country selector.
- Store normalised E.164 when parsing succeeds and retain display input separately when necessary.
- Do not reject legitimate international numbers purely because they do not match a Sri Lankan pattern.
- Database fields: `phone_e164`, `phone_display`.

#### 8. Award Nomination / Category

- Required.
- Searchable accessible select populated from active categories in the current cycle.
- Store category ID plus submission snapshot of category name/code.

#### 9. Supporting Documents (Optional) – PDF, DOC, or Images

- Optional.
- Maximum five files.
- Maximum 5 MiB per file; use `5 * 1024 * 1024` bytes consistently.
- Allowed extensions/MIME families:
  - PDF: `.pdf`, `application/pdf`;
  - Word: `.doc`, `.docx` with recognised Word MIME types;
  - images: `.jpg`, `.jpeg`, `.png`, `.webp`.
- Do not allow SVG, HTML, ZIP, executables, macro-enabled Office formats or files disguised through renamed extensions.
- Show filename, formatted size, upload state, remove action before finalisation and retry action on failure.

#### 10. Upload Payment Slip / Screenshot (Proof of Payment)

- Required for Release 1 unless a cycle setting explicitly marks payment proof unnecessary.
- Exactly one file.
- Maximum 5 MiB.
- Allowed: PDF, JPEG, PNG or WebP.
- Store privately in R2 as `payment_proof`.
- Never display through a permanent public URL.

#### 11. Agreement checkbox

Required, unchecked by default. The visible label must be exactly:

> I confirm that the details provided are accurate and agree to the terms of the nomination process

The phrase `terms of the nomination process` must link to the applicable terms in a way that does not toggle the checkbox accidentally.

Store:

- accepted boolean;
- exact declaration version;
- accepted timestamp;
- restricted request metadata required for audit, using minimised or hashed values where appropriate.

#### 12. Cloudflare Turnstile

- Required on final submission.
- Use managed or invisible appearance only when it remains accessible and understandable.
- The server must call Siteverify and validate success, expected hostname and action.
- Tokens are single-use and short-lived; refresh the widget after expiry or failed finalisation.
- A client-side success state without server validation is never sufficient.

### 9.3 Form layout

Recommended grouping:

1. **Nominee details** — name/company, designation, sector, website.
2. **Contact details** — email and phone.
3. **Nomination** — award category.
4. **Documents** — supporting files and payment proof.
5. **Confirmation** — declaration, Turnstile and submit.

Use one centred content column, approximately 720–820px maximum, with generous spacing. A restrained glass header or summary surface may be used, but the input body should remain crisp and high contrast.

### 9.4 Submission UX

- One dominant button: **Submit nomination**.
- Disable only while a real submission/upload process is active.
- Show field errors inline and in an accessible summary.
- Scroll and focus the first invalid field.
- During upload, change the action area into a stable progress state rather than replacing the whole page.
- Show overall progress plus per-file status.
- Permit retry of failed files without re-uploading successful files.
- Warn before closing the page only once upload has begun.
- Do not claim success until R2 objects and the database transaction are confirmed.
- On success, clear local form state and show the generated reference.

### 9.5 Anti-abuse measures

In addition to Turnstile:

- rate limit by IP signal, email hash and action;
- validate `Origin` and `Host`;
- include an invisible honeypot field rejected when populated;
- apply a minimum plausible completion-time signal without blocking accessibility tools;
- use an idempotency key for initiate and complete operations;
- cap provisional uploads per requester;
- expire incomplete upload sessions.

### 9.6 No public draft system

Release 1 does not need accountless draft saving, email verification codes or resume links. The minimal form should remain simple. Browser-local recovery may preserve non-sensitive text briefly during the active tab session, but it must not store selected files, Turnstile tokens or sensitive data in long-lived local storage.

## 10. Application, Payment and Account Status Models

### 10.1 Workflow status enum

```text
uploading
submitted
under_review
changes_requested
resubmitted
approved
entry_confirmed
shortlisted
winner
not_selected
rejected
withdrawn
archived
```

`uploading` is provisional and not visible in normal admin lists unless troubleshooting or cleaning stale sessions.

### 10.2 Payment status enum

```text
proof_submitted
under_review
verified
rejected
waived
refunded
not_required
```

### 10.3 Account access status enum

```text
not_created
pending_invite
invited
active
suspended
revoked
```

### 10.4 Applicant-facing labels

| Internal status | Applicant label | Core message |
|---|---|---|
| `submitted` | Nomination received | Your nomination has been received successfully. |
| `under_review` | Under review | The GBE Awards team is reviewing the nomination. |
| `changes_requested` | Action required | Please complete the requested updates. |
| `resubmitted` | Updates received | Your revised information has been received. |
| `approved` | Nomination approved | Your nomination has passed the initial review. |
| `entry_confirmed` | Entry confirmed | All required entry steps are complete. |
| `shortlisted` | Shortlisted | Your entry has been shortlisted. |
| `winner` | Award winner | Your entry has been selected as a winner. |
| `not_selected` | Outcome available | Your entry was not selected for this stage. |
| `rejected` | Nomination not approved | The nomination did not meet the applicable requirements. |
| `withdrawn` | Withdrawn | The nomination has been withdrawn. |

### 10.5 Core transition rules

- `uploading` → `submitted` only after all expected R2 objects are confirmed.
- `submitted` → `under_review`, `changes_requested`, `approved`, `rejected`, `withdrawn`.
- `under_review` → `changes_requested`, `approved`, `rejected`.
- `changes_requested` → `resubmitted`, `withdrawn`.
- `resubmitted` → `under_review`, `changes_requested`, `approved`, `rejected`.
- `approved` → `entry_confirmed`, `withdrawn`, or exceptional `rejected` with elevated permission.
- `entry_confirmed` → `shortlisted`, `not_selected`, `withdrawn`.
- `shortlisted` → `winner`, `not_selected`.
- terminal records may → `archived`.

Application approval triggers account linking/invitation but account access remains a separate status.

### 10.6 Transition controls

- All transitions go through one central domain service.
- Change requests require instructions and at least one unlocked field/document requirement.
- Rejection requires an internal reason and applicant-facing communication.
- Backward transitions require elevated permission and a reason.
- Outcome changes require outcome-release permission.
- Status changes create status history, audit and email-outbox records.
- Payment verification does not directly overwrite workflow state; a controlled rule may advance `approved` to `entry_confirmed` once all requirements are met.

## 11. Visual Direction

### 11.1 Design concept

**Design-system working name:** GBE Maison  
**Concept:** Quiet Luxury Glass  
**Character:** editorial, ceremonial, precise, calm, modern, warm and internationally credible.

The interface must combine:

- an ivory architectural background;
- clear white and translucent surfaces;
- deep ink typography;
- champagne-metal accents;
- serif display moments;
- crisp sans-serif application controls;
- layered blur and light refraction;
- fine borders rather than heavy shadows;
- generous negative space;
- subtle, fast motion.

The design must not resemble:

- a generic colourful SaaS dashboard;
- a dark crypto interface;
- a government form;
- an over-decorated gold awards poster;
- a neumorphic interface;
- a template with glass applied to every rectangle.

### 11.2 Light-mode requirement

Release 1 is intentionally light mode only. Do not add a theme switcher or dark tokens. The implementation should still use semantic colour tokens so a future dark theme is possible without component rewrites.

### 11.3 Colour palette

#### Core neutrals

| Token | Hex | Purpose |
|---|---:|---|
| `--background` | `#F8F6F1` | Main canvas |
| `--background-elevated` | `#FBFAF6` | Secondary canvas |
| `--surface` | `#FFFDF8` | Opaque cards and forms |
| `--surface-strong` | `#FFFFFF` | High-clarity content |
| `--ink` | `#171713` | Primary text |
| `--graphite` | `#45443E` | Secondary text |
| `--muted` | `#747168` | Muted copy |
| `--mist` | `#E8E5DD` | Standard borders |
| `--mist-strong` | `#DAD5CA` | Stronger dividers |

#### Luxury accents

| Token | Hex | Purpose |
|---|---:|---|
| `--champagne` | `#C6A969` | Primary accent |
| `--antique-gold` | `#9D7D3F` | Strong accent and hover |
| `--pale-gold` | `#EAD9A5` | Gradient highlight |
| `--gold-wash` | `#F4ECD8` | Selected backgrounds |
| `--bronze-ink` | `#6D552B` | Accessible gold text |

#### Semantic colours

| Meaning | Foreground | Background | Border |
|---|---:|---:|---:|
| Information/submitted | `#315C83` | `#EAF1F7` | `#CADCEB` |
| Review/pending | `#7A5D17` | `#F7F0DD` | `#E8D7A8` |
| Success/approved | `#23604E` | `#E6F2ED` | `#C8E2D8` |
| Action required | `#94452D` | `#F9ECE7` | `#EBCFC5` |
| Error/rejected | `#873D3D` | `#F8EAEA` | `#E9C8C8` |
| Shortlisted | `#684780` | `#F1EAF6` | `#DCCDE7` |
| Winner | `#6D552B` | `#F6EED9` | `#E4D1A0` |

Bright yellow must not be used for primary text because it lacks contrast on light surfaces.

### 11.4 Gradients

#### Signature gold gradient

```css
linear-gradient(135deg, #8B6A32 0%, #C6A969 45%, #EAD9A5 100%)
```

Use only for:

- the primary ceremonial action;
- selected premium detail;
- completion mark;
- winner accent;
- invitation-email header detail;
- small brand strokes.

Never use the signature gradient as a full application-page background.

#### Background lighting

```css
background:
  radial-gradient(circle at 12% 8%, rgba(198, 169, 105, 0.12), transparent 30%),
  radial-gradient(circle at 88% 6%, rgba(121, 112, 92, 0.08), transparent 28%),
  radial-gradient(circle at 72% 82%, rgba(255, 255, 255, 0.72), transparent 34%),
  #F8F6F1;
```

Lighting must remain subtle and should not reduce text contrast.

### 11.5 Typography

#### Display typeface

**Cormorant Garamond**, variable or selected weights.

Use for:

- public application hero;
- major page headings;
- approval and outcome moments;
- ceremonial cards;
- selected metric numbers where appropriate.

Allowed weights: 500 and 600. Avoid thin 300-weight headings on small screens.

#### Interface typeface

**Manrope**, variable.

Use for:

- navigation;
- body copy;
- labels;
- inputs;
- buttons;
- tables;
- badges;
- administrative content.

Use `next/font/google` or self-hosted optimised font files through the framework. Do not load fonts through runtime CSS imports.

#### Type scale

| Token | Desktop | Mobile | Line height | Typeface |
|---|---:|---:|---:|---|
| Display XL | 64px | 44px | 1.02 | Cormorant |
| Display | 50px | 38px | 1.06 | Cormorant |
| Page heading | 38px | 30px | 1.12 | Cormorant or Manrope |
| Section heading | 26px | 23px | 1.24 | Manrope |
| Card heading | 18px | 17px | 1.35 | Manrope |
| Body large | 17px | 16px | 1.65 | Manrope |
| Body | 15px | 15px | 1.65 | Manrope |
| Small | 13px | 13px | 1.5 | Manrope |
| Micro label | 11px | 11px | 1.35 | Manrope |

Rules:

- body text must not be below 15px in primary content;
- uppercase is reserved for short eyebrow labels;
- long headings must use balanced wrapping where supported;
- avoid heavy bold everywhere; hierarchy should use size, space and colour first;
- numeric references and amounts should use tabular numerals.

### 11.6 Spacing system

Base unit: 4px.

```text
1: 4px
2: 8px
3: 12px
4: 16px
5: 20px
6: 24px
8: 32px
10: 40px
12: 48px
16: 64px
20: 80px
24: 96px
```

Page layout:

- desktop content max width: 1440px for admin shell;
- form content max width: 760px;
- form plus summary layout max width: 1180px;
- public hero max text width: 760px;
- standard desktop horizontal gutter: 32px–48px;
- mobile gutter: 20px;
- section separation: 48px desktop, 32px mobile.

### 11.7 Border radii

| Token | Value | Use |
|---|---:|---|
| `--radius-xs` | 6px | Compact tags |
| `--radius-sm` | 10px | Inputs, small controls |
| `--radius-md` | 14px | Buttons, dropdowns |
| `--radius-lg` | 18px | Cards |
| `--radius-xl` | 24px | Feature glass panels |
| `--radius-2xl` | 30px | Hero/login panels only |
| `--radius-pill` | 999px | Status badges and small chips |

Do not use a different arbitrary radius on each component.

### 11.8 Shadows

```css
--shadow-soft:
  0 1px 2px rgba(35, 30, 20, 0.03),
  0 12px 34px rgba(35, 30, 20, 0.055);

--shadow-float:
  0 18px 55px rgba(35, 30, 20, 0.08),
  0 2px 8px rgba(35, 30, 20, 0.035);

--shadow-focus:
  0 0 0 3px rgba(198, 169, 105, 0.22);
```

No black drop shadows with high opacity. Gold glow is permitted only at low opacity on ceremonial states.

---

## 12. Glassmorphism System

Glassmorphism is a defining part of the GBE experience, but it must be implemented as a structured material system rather than a one-off effect.

### 12.1 Material levels

#### Glass 1 — Shell glass

Used for sticky navigation, admin top bar, applicant sidebar and mobile navigation.

```css
background: rgba(255, 253, 248, 0.76);
border: 1px solid rgba(255, 255, 255, 0.78);
box-shadow: 0 10px 34px rgba(35, 30, 20, 0.055);
backdrop-filter: blur(20px) saturate(125%);
-webkit-backdrop-filter: blur(20px) saturate(125%);
```

#### Glass 2 — Feature glass

Used for login, public application introduction, applicant welcome/status card and important confirmation panels.

```css
background:
  linear-gradient(145deg, rgba(255, 255, 255, 0.74), rgba(255, 253, 248, 0.58));
border: 1px solid rgba(255, 255, 255, 0.84);
box-shadow:
  0 24px 70px rgba(35, 30, 20, 0.075),
  inset 0 1px 0 rgba(255, 255, 255, 0.9);
backdrop-filter: blur(24px) saturate(130%);
-webkit-backdrop-filter: blur(24px) saturate(130%);
```

#### Glass 3 — Utility glass

Used for compact floating filters, sticky action bars, popovers and compact status progress.

```css
background: rgba(255, 255, 255, 0.68);
border: 1px solid rgba(218, 213, 202, 0.65);
box-shadow: 0 12px 34px rgba(35, 30, 20, 0.06);
backdrop-filter: blur(16px) saturate(120%);
-webkit-backdrop-filter: blur(16px) saturate(120%);
```

#### Ceremonial gold glass

Use only for winner, completed application or premium selection highlights.

```css
background:
  linear-gradient(135deg, rgba(246, 238, 217, 0.86), rgba(255, 253, 248, 0.66));
border: 1px solid rgba(198, 169, 105, 0.42);
box-shadow:
  0 22px 60px rgba(109, 85, 43, 0.10),
  inset 0 1px 0 rgba(255, 255, 255, 0.86);
backdrop-filter: blur(22px) saturate(125%);
```

### 12.2 Glass usage rules

- No more than three overlapping translucent layers in a viewport.
- All text-bearing glass must have a sufficiently predictable background behind it.
- Form inputs inside glass panels should use mostly opaque white/ivory surfaces.
- Data tables and dense long-form content must use clear surfaces rather than highly translucent glass.
- Glass is strongest in shells, summaries, progress, status and transition moments.
- Blur must not be used as a substitute for hierarchy.
- Add a solid-colour fallback for browsers or accessibility settings that do not support backdrop filters.
- Reduce blur and transparency when `prefers-reduced-transparency` becomes broadly available; until then provide a local class/config flag.
- Printing must remove blur and use solid white surfaces.

### 12.3 Refraction and decoration

Optional decorative treatments:

- a 1px inner highlight;
- faint diagonal sheen at less than 8% opacity;
- soft grain texture at 1–2% opacity;
- blurred gold orb behind, never in front of, key content;
- subtle hairline gold edge on selected cards.

Avoid:

- large floating bubbles;
- moving liquid effects;
- continuous animated gradients;
- thick glow rings;
- illegible transparent tables.

---

## 13. Components and Interaction Patterns

### 13.1 Required foundational components

```text
AppLogo
PublicHeader
ApplicantShell
AdminShell
GlassPanel
GlassNavigation
PageIntro
PageHeader
Breadcrumbs
PrimaryButton
SecondaryButton
GhostButton
DangerButton
IconButton
StatusBadge
PaymentBadge
PortalAccessBadge
ApplicationReference
StatusProgress
ProgressRing
SectionStatus
FormField
TextField
TextareaField
SelectField
ComboboxField
CheckboxField
PhoneField
DateField
UploadDropzone
UploadItem
UploadProgressSummary
DocumentViewerLink
ProfileAvatarEditor
DirtyStateIndicator
StickyActionBar
DataTable
FilterBar
SearchField
Pagination
ApplicationQuickView
StatusTimeline
ActivityTimeline
InternalNoteComposer
ApplicantMessageComposer
EmptyState
Skeleton
Toast
Dialog
AlertDialog
Sheet
Popover
Tooltip
CommandMenu
ErrorSummary
InlineAlert
ConfirmationPanel
MetricCard
SimpleChart
```

### 13.2 Buttons

#### Primary

- deep ink background;
- ivory text;
- 48px standard height;
- radius 14px;
- subtle lift of 1px on hover;
- focus ring uses champagne transparency;
- disabled state must remain readable.

#### Ceremonial primary

Use signature gold gradient only for:

- final application submission;
- account activation completion;
- payment-proof confirmation where an applicant action is required;
- confirmed winner-specific action.

#### Secondary

- ivory or transparent background;
- mist border;
- ink text;
- no heavy shadow.

#### Destructive

- calm red treatment, not saturated bright red;
- destructive actions always require a confirmation dialog and contextual explanation.

### 13.3 Form controls

- standard height: 50px;
- large textarea: minimum 160px;
- label above control;
- description below label or control;
- required indicator described accessibly;
- border darkens on hover;
- focus uses ink border plus champagne ring;
- error uses semantic red border and inline text;
- success ticks are not shown on every normal field;
- browser autofill styling must be normalised;
- sensitive or final fields must not be silently cleared after validation failure.

### 13.4 Cards

- use large grouped sections rather than many tiny cards;
- standard padding: 24px desktop, 20px mobile;
- feature card padding: 32px–40px;
- card title and action align on one row where space allows;
- selected cards receive a fine gold border and gold-wash background;
- no card should exist merely to contain one line of text.

### 13.5 Status badge

- sentence case;
- compact pill shape;
- icon optional;
- never rely on colour alone;
- use consistent labels throughout table, timeline and dashboard.

### 13.6 Applicant status timeline

Display completed and upcoming stages with:

- stage title;
- short explanation;
- date/time for completed stages;
- clear **Action required** item when applicable;
- no disclosure of confidential judging detail.

### 13.7 Admin data table

Columns by default:

- selection checkbox;
- reference;
- organisation/nominee;
- category;
- contact;
- workflow status;
- payment status;
- assigned reviewer;
- updated date;
- actions.

Behaviour:

- sticky header;
- sortable columns;
- server-side pagination;
- search by reference, name, contact and email;
- filters represented in URL query parameters;
- horizontal overflow on smaller desktops;
- row click opens detail, while explicit actions remain accessible;
- bulk actions only after selection;
- current filter count visible;
- empty and error states are designed, not raw messages.

### 13.8 Application quick view

A right-side sheet can show:

- reference and status;
- applicant and organisation summary;
- category;
- completeness warnings;
- recent activity;
- quick links and allowed status actions.

The full review remains a dedicated page. Do not attempt to place the entire application in a narrow sheet.

### 13.9 Motion

Use `motion` for React sparingly.

- standard transition: 180ms;
- panel transition: 220ms;
- easing: `cubic-bezier(0.22, 1, 0.36, 1)`;
- entrance movement: 6–12px maximum;
- status updates may use a brief opacity/scale confirmation;
- page content should not slowly fade on every navigation;
- respect `prefers-reduced-motion`;
- no bounce, infinite floating or ornamental looping motion.

---

## 14. Responsive Behaviour

### 14.1 Breakpoints

Use Tailwind defaults unless a component requires a documented exception.

```text
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
2xl: 1536px
```

### 14.2 Public nomination form

- mobile: single column with a stable submit/progress area;
- tablet: centred single column with wider spacing;
- desktop: centred 720–820px form column, with only a small optional contextual summary area;
- no wizard stepper or sticky multi-step rail;
- upload controls must support camera/photo selection on mobile;
- file rows wrap cleanly and never cause horizontal scrolling;
- Turnstile must not create layout shift;
- submit progress remains visible without covering validation messages.

### 14.3 Applicant portal

- desktop: 232px glass sidebar plus content;
- tablet: collapsible sidebar;
- mobile: compact top bar and bottom-sheet navigation;
- dashboard cards collapse into one column;
- status remains above less urgent content.

### 14.4 Admin area

- designed primarily for 1280px and above;
- usable from 768px with collapsible navigation and table overflow;
- complex bulk review is not optimised for phone, but essential read/update actions must remain possible;
- sidebar width: 240px expanded, 72px collapsed.

---

## 15. Accessibility and Content Standards

### 15.1 Accessibility target

Target WCAG 2.2 AA.

Required:

- semantic landmarks and headings;
- visible keyboard focus;
- logical tab order;
- skip link;
- all controls keyboard accessible;
- form errors announced and associated with fields;
- dialogs trap focus and restore it correctly;
- status changes use appropriate live regions;
- colour contrast validated on actual glass backgrounds;
- minimum 44px touch targets for key controls;
- reduced-motion support;
- no information communicated by colour alone;
- accessible names for icon-only buttons;
- tables use correct header associations;
- uploaded file state is screen-reader comprehensible.

### 15.2 Content style

- English (United Kingdom).
- Use clear, professional language.
- Prefer **application** over **submission** when referring to the complete record, except at the moment of submitting.
- Use **organisation** with UK spelling.
- Dates displayed as `11 July 2026`.
- Times displayed using the configured cycle timezone and a clear timezone suffix when relevant.
- Database timestamps remain UTC.
- Avoid blame-oriented errors. Explain what happened and the next action.
- Avoid internal terms such as `approved_for_portal` in applicant copy.

### 15.3 Error examples

Good:

```text
We could not save this change. Your existing saved information is safe. Please try again.
```

Avoid:

```text
Mutation failed: 500.
```

---

## 16. Technical Stack

### 16.1 Final stack decision

| Area | Technology |
|---|---|
| Framework | Next.js 16.x App Router, latest stable compatible patch at implementation |
| UI runtime | React release required by the selected Next.js version |
| Language | TypeScript with strict mode and no unchecked production `any` |
| Package manager | Bun with committed lockfile |
| Runtime | Vercel-supported Node.js runtime unless a route is deliberately edge-safe |
| Styling | Tailwind CSS 4.x |
| Component foundation | shadcn/ui source components using Base UI primitives |
| Database | Neon PostgreSQL |
| ORM/migrations | Drizzle ORM + Drizzle Kit |
| Postgres driver | `@neondatabase/serverless` using the appropriate transaction-capable connection mode |
| Authentication | Better Auth with Drizzle adapter, admin plugin and two-factor plugin |
| File storage | Cloudflare R2 through the S3-compatible API |
| Forms | React Hook Form + Zod + `@hookform/resolvers` |
| Admin data fetching | Server Components for initial data; TanStack Query for interactive grids and mutation refresh |
| Tables | TanStack Table |
| URL state | `nuqs` for typed search/filter/sort/page state |
| File selection | `react-dropzone` or an equally accessible owned wrapper |
| R2 signing | AWS SDK v3 S3 client + `@aws-sdk/s3-request-presigner` |
| File signature inspection | `file-type` plus server allow-list logic |
| Image processing | `sharp` |
| Profile crop UI | `react-easy-crop` or equivalent maintained package |
| Excel exports | `exceljs` |
| CSV exports | `csv-stringify` |
| Email | Resend + React Email |
| Icons | Lucide React |
| Animation | Motion |
| Toasts | Sonner |
| Dates | date-fns + date-fns-tz or an equivalent standards-based timezone helper |
| Charts | Recharts only for useful compact admin reporting |
| Product analytics | PostHog in a privacy-restricted configuration, optional behind a flag |
| Bot protection | Cloudflare Turnstile |
| Rate limiting | Upstash Redis + Upstash Ratelimit or equivalent approved managed Redis |
| PDF output | `@react-pdf/renderer` only where a downloadable summary/receipt is required |
| Unit/component tests | Vitest + Testing Library |
| End-to-end tests | Playwright |
| Deployment | Vercel |
| DNS/CDN/storage edge | Cloudflare |
| Source control/CI | GitHub + GitHub Actions + Vercel previews |
| Error visibility | Structured application logs, request IDs, provider dashboards and health checks; no Sentry |

### 16.2 Infrastructure boundaries

- Neon stores relational data only.
- Cloudflare R2 stores every runtime-managed file.
- The browser never connects directly to Neon.
- The browser uploads directly to R2 only through a short-lived, object-specific presigned URL generated by the portal backend.
- Better Auth tables live in the same Neon database.
- Resend sends transactional messages but the portal database remains the source of truth for message intent and delivery state.
- Vercel hosts the web application and server routes.

### 16.3 R2 bucket strategy

Use separate buckets or equivalent strict namespace/policy separation:

```text
gbe-portal-private
  applications/
  payment-proofs/
  profiles/originals/
  profiles/derived/
  exports/
  requested-documents/

gbe-portal-public
  brand/official/
  brand/derived/
```

Private objects never receive permanent public URLs. Public brand assets may use a dedicated custom domain such as `assets.portal.gbeawards.com`.

### 16.4 Brand/logo acquisition requirement

The implementation agent must obtain the current official GBE Awards logo from `https://gbeaward.com` during implementation.

- Do not hotlink the website asset.
- Preserve the official proportions, wording and mark.
- Verify that the asset is the current header/primary brand logo.
- Store the original and optimised variants in the public R2 brand prefix.
- Produce appropriately sized PNG/WebP/AVIF variants; retain SVG only when the source is a genuine trusted SVG.
- Use a database/system-setting asset key rather than scattering hard-coded file URLs.
- Create the favicon/app icon from the official mark through a generated route or approved R2 variant.

### 16.5 Package policy

- Resolve and lock actual versions at project creation.
- Commit `bun.lock`.
- CI uses `bun install --frozen-lockfile`.
- Pin framework, auth, ORM and infrastructure packages deliberately.
- Do not install an admin template that dictates the visual identity.
- A package must have a clear purpose, acceptable licence and active maintenance.
- Prefer owned utilities for small behaviour rather than accumulating dependencies.
- Bun is the package manager and script runner; do not assume production functions run on Bun.

### 16.6 Expected package families

```json
{
  "core": ["next", "react", "react-dom", "typescript"],
  "database": ["drizzle-orm", "drizzle-kit", "@neondatabase/serverless"],
  "auth": ["better-auth", "@better-auth/drizzle-adapter"],
  "r2": ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner", "file-type", "sharp"],
  "forms": ["react-hook-form", "zod", "@hookform/resolvers", "react-dropzone"],
  "admin": ["@tanstack/react-table", "@tanstack/react-query", "nuqs", "exceljs", "csv-stringify"],
  "ui": ["tailwindcss", "class-variance-authority", "clsx", "tailwind-merge", "lucide-react", "motion", "sonner", "react-easy-crop"],
  "email": ["resend", "@react-email/components"],
  "operations": ["@upstash/redis", "@upstash/ratelimit"],
  "testing": ["vitest", "@testing-library/react", "@playwright/test"]
}
```

The actual `package.json` must use resolved versions rather than `latest` placeholders.

## 17. Application Architecture

### 17.1 Architecture style

Use a modular monolith in one Next.js repository. Public form, applicant portal, admin portal, API routes, emails and jobs share domain types and services while remaining separated by route groups and modules.

Do not split into separate frontend/admin/API repositories for Release 1.

### 17.2 Server-first rules

- Server Components by default.
- Client Components only for interaction, uploads, table controls, rich selects, crop UI and animation.
- Initial authenticated page data is loaded on the server.
- Interactive admin tables use typed API responses with TanStack Query where this improves responsiveness.
- Mutations use validated Server Actions or Route Handlers.
- R2 uploads use Route Handlers for signing/finalisation and direct browser-to-R2 transfer.
- Private data is never statically cached.
- Public cycle/category data may use tagged revalidation.
- Avoid client waterfalls and duplicated fetches.

### 17.3 Data-access layer

Create a server-only DAL that:

- retrieves the Better Auth session;
- loads the portal profile and effective permissions;
- checks applicant ownership or staff access;
- uses the correct Neon database role/context;
- returns explicit DTOs rather than raw database rows;
- removes internal notes, security metadata and private file keys by default;
- centralises filters, pagination and search;
- supports testable permission decisions.

Suggested structure:

```text
src/server/dal/
  auth.ts
  profiles.ts
  applications.ts
  files.ts
  payments.ts
  messages.ts
  categories.ts
  exports.ts
  audit.ts
```

### 17.4 Domain services

```text
src/server/services/
  public-submission-service.ts
  upload-service.ts
  file-validation-service.ts
  application-service.ts
  application-transition-service.ts
  application-version-service.ts
  field-lock-service.ts
  invitation-service.ts
  profile-service.ts
  payment-service.ts
  message-service.ts
  export-service.ts
  email-outbox-service.ts
  audit-service.ts
```

Business rules must live in services, not page components.

### 17.5 Repository structure

```text
src/
  app/
    (public)/
    (auth)/
    (portal)/
    (admin)/
    api/
    layout.tsx
    globals.css
  components/
    brand/
    ui/
    glass/
    forms/
    uploads/
    portal/
    admin/
    shared/
  config/
    brand.ts
    navigation.ts
    permissions.ts
    feature-flags.ts
  emails/
    components/
    templates/
  lib/
    auth/
    db/
    r2/
    analytics/
    validation/
    formatting/
    constants/
    utils/
  server/
    dal/
    actions/
    services/
    repositories/
    jobs/
  types/
    domain.ts
    api.ts
    forms.ts
  tests/
    unit/
    integration/
    e2e/
drizzle/
  migrations/
  meta/
scripts/
  seed.ts
  verify-env.ts
```

Do not place user-uploaded or admin-generated runtime files in the repository or Vercel filesystem.

### 17.6 Query and mutation conventions

- Every list query has a Zod schema.
- Every mutation returns a discriminated typed result.
- Use database transactions for multi-write domain operations.
- Use optimistic UI only where rollback is safe and clear.
- Invalidate only the affected query keys/tags.
- Use stable request IDs across route, audit and log records.
- Never return raw Neon, Drizzle, R2 or Resend errors to the user.

### 17.7 Naming conventions

- files: kebab-case;
- components: PascalCase;
- variables/functions: camelCase;
- database tables/columns: snake_case;
- enum values: snake_case;
- environment variables: UPPER_SNAKE_CASE;
- R2 object keys: generated lowercase paths with UUID/ULID segments;
- analytics events: `object action` format.

## 18. Authentication and Access Architecture

### 18.1 Authentication provider

Use Better Auth with its Drizzle PostgreSQL adapter in the Neon database.

Required configuration principles:

- email/password enabled;
- public email/password sign-up disabled;
- no OAuth providers in Release 1 unless separately approved;
- secure cookies;
- password reset implemented through Resend;
- other sessions revoked on password reset;
- admin plugin available only through authorised server operations;
- two-factor plugin enabled for staff;
- Next.js integration mounted at `/api/auth/[...all]`.

### 18.2 Applicant account creation

Public nomination does not create an auth user.

On approval:

1. Normalise and check the approved email.
2. Link the application to an existing applicant profile when an authorised exact match exists.
3. Otherwise create the auth user through server-only admin capability with a cryptographically random unusable initial password.
4. Create the portal profile and application ownership link in a transaction-safe workflow.
5. Issue a single-use invitation/password-setup flow.
6. Mark email ownership as verified when the valid invitation link is completed.
7. Revoke any superseded invitations.

Never email a generated password.

### 18.3 Invitation security

- Invitation tokens must be cryptographically random and stored hashed where custom tokens are used.
- Default applicant invite lifetime: 72 hours, configurable.
- Staff invite lifetime: 24 hours, configurable.
- Accepting an invite consumes it.
- Resending creates a new token and revokes the old one.
- Generic failure text must not reveal account state.
- The invitation email must state that access was created because a GBE nomination was approved.

### 18.4 Staff authentication

- Staff are invitation only.
- TOTP MFA is mandatory before access to production admin data.
- Recovery codes must be displayed once and securely hashed/stored according to Better Auth behaviour.
- A staff role is held in stable portal tables, not trusted solely from client metadata.
- Suspended staff are rejected by the DAL on every request.
- High-risk actions may require recent authentication or MFA confirmation.

### 18.5 Session handling

- Secure, HttpOnly session cookies where applicable.
- SameSite=Lax or stricter according to the flow.
- Scope cookies to the portal host unless cross-subdomain behaviour is explicitly required.
- Do not store session tokens, invitation tokens or privileged credentials in localStorage.
- Authorisation is rechecked for each mutation.
- Session fixation must be prevented on activation and password reset.

### 18.6 Login and recovery

- Login page is shared visually but redirects by effective role.
- Rate limit login and recovery endpoints.
- Apply Turnstile after repeated/suspicious attempts or on all password-recovery requests when operationally acceptable.
- Unknown-email recovery returns the same response as known-email recovery.
- Password requirements: minimum 12 characters, maximum according to provider limits, allow password managers and pasted values.
- Staff password reset never bypasses MFA enrolment.

### 18.7 Primary email changes

Applicants cannot casually edit the primary login email.

A change requires:

- authenticated request;
- verification of the new address;
- conflict check;
- optional current-password confirmation;
- elevated/admin review where application ownership may be affected;
- audit and security notification to old and new addresses.

Release 1 may expose this as a support request to `info@gbeaward.com` rather than self-service.

## 19. Neon PostgreSQL Data Model

### 19.1 General standards

- Primary keys: UUIDv7/UUID or ULID-compatible UUID strategy; do not use guessable sequential public IDs.
- Human references: separate formatted values such as `GBE-2026-000001`.
- Timestamps: `timestamptz` stored in UTC.
- Display timezone: `Asia/Colombo`.
- Emails: store normalised form for matching and submitted/display form where useful.
- Money: integer minor units plus ISO currency.
- Soft deletion: `deleted_at` and `deleted_by` on recoverable operational records.
- Every mutable table includes `created_at` and `updated_at` where applicable.
- Use database constraints, foreign keys, unique indexes and enums/check constraints, not TypeScript validation alone.

Better Auth owns its required `user`, `session`, `account`, `verification` and plugin tables. Portal tables reference the Better Auth user ID.

### 19.2 `profiles`

```text
id uuid primary key
auth_user_id text unique not null
account_kind applicant | staff
nominee_kind individual | organisation | unknown default unknown
display_name text not null
official_name text null
profile_image_file_id uuid null
designation text null
industry_sector text null
phone_e164 text null
phone_display text null
alternate_email text null
business_website text null
address_line_1 text null
address_line_2 text null
city text null
region text null
postal_code text null
country_code char(2) null
short_bio text null
linkedin_url text null
facebook_url text null
instagram_url text null
is_active boolean default true
created_at timestamptz
updated_at timestamptz
```

`official_name` is not applicant-editable through the ordinary profile screen. `display_name` may be editable subject to validation and must not silently rewrite application history.

### 19.3 `staff_memberships`

```text
id uuid primary key
profile_id uuid unique references profiles(id)
role super_admin | admin | reviewer | finance | support
permissions jsonb not null default '{}'
can_view_all_applications boolean default false
mfa_required boolean default true
suspended_at timestamptz null
created_by uuid null
created_at timestamptz
updated_at timestamptz
```

### 19.4 `award_cycles`

```text
id uuid primary key
name text
slug text unique
year integer
status cycle_status
timezone text default 'Asia/Colombo'
opens_at timestamptz
closes_at timestamptz
results_release_at timestamptz null
support_email text default 'info@gbeaward.com'
heading text
intro_copy text
nomination_fee_minor bigint null
currency char(3) null
declaration_text text
declaration_version text
terms_version text
privacy_version text
form_schema_version text
brand_logo_file_id uuid null
settings jsonb default '{}'
created_at timestamptz
updated_at timestamptz
```

### 19.5 `award_categories`

```text
id uuid primary key
cycle_id uuid references award_cycles(id)
code text
name text
slug text
short_description text null
internal_notes text null
display_order integer default 0
is_active boolean default true
capacity integer null
fee_override_minor bigint null
created_at timestamptz
updated_at timestamptz
unique(cycle_id, code)
unique(cycle_id, slug)
```

### 19.6 `applications`

```text
id uuid primary key
reference text unique null until finalised
cycle_id uuid references award_cycles(id)
category_id uuid references award_categories(id)
owner_profile_id uuid null references profiles(id)
workflow_status application_status
payment_status payment_status
account_access_status account_access_status
nominee_name text
designation text null
industry_sector text
business_website text null
email_normalised text
email_display text
phone_e164 text null
phone_display text
category_name_snapshot text
category_code_snapshot text
declaration_accepted boolean
declaration_text_snapshot text
declaration_version text
terms_version text
privacy_version text
form_schema_version text
submitted_at timestamptz null
approved_at timestamptz null
assigned_reviewer_id uuid null references profiles(id)
current_version integer default 0
last_activity_at timestamptz
created_at timestamptz
updated_at timestamptz
deleted_at timestamptz null
deleted_by uuid null
```

The current columns support efficient filtering. Original and subsequent values are preserved in `application_versions`.

### 19.7 `application_versions`

```text
id uuid primary key
application_id uuid references applications(id)
version integer
source public_submission | applicant_resubmission | staff_correction | system
payload jsonb not null
changed_fields text[] not null default '{}'
reason text null
created_by_profile_id uuid null
created_at timestamptz
unique(application_id, version)
```

Version 1 is the immutable public submission snapshot. Staff corrections update current columns only after a new version is written. Do not overwrite or delete version 1 through normal operations.

### 19.8 `application_field_access`

```text
id uuid primary key
application_id uuid references applications(id)
field_key text
state locked | applicant_editable | admin_only
request_id uuid null
expires_at timestamptz null
updated_by uuid
updated_at timestamptz
unique(application_id, field_key)
```

By default all submitted application fields are locked to applicants.

### 19.9 `files`

```text
id uuid primary key
bucket private | public
object_key text unique
purpose supporting_document | payment_proof | profile_original | profile_512 | profile_96 | export | brand | requested_document | other
status pending | uploaded | validating | ready | rejected | superseded | deleted
original_filename text null
safe_download_filename text null
extension text null
mime_type_claimed text null
mime_type_detected text null
size_bytes bigint
etag text null
sha256 text null
width integer null
height integer null
created_by_profile_id uuid null
created_via_public_submission boolean default false
validated_at timestamptz null
rejection_reason text null
created_at timestamptz
updated_at timestamptz
deleted_at timestamptz null
```

Never use the original filename as the R2 object key.

### 19.10 `application_files`

```text
id uuid primary key
application_id uuid references applications(id)
file_id uuid references files(id)
kind supporting_document | payment_proof | requested_document
position integer default 0
is_current boolean default true
replaces_application_file_id uuid null
uploaded_by_profile_id uuid null
created_at timestamptz
```

### 19.11 `upload_sessions`

```text
id uuid primary key
application_id uuid references applications(id)
public_token_hash text unique
idempotency_key text unique
expected_manifest jsonb
status initiated | uploading | completed | expired | failed
expires_at timestamptz
completed_at timestamptz null
request_fingerprint_hash text null
created_at timestamptz
updated_at timestamptz
```

### 19.12 `application_status_history`

```text
id uuid primary key
application_id uuid references applications(id)
from_status application_status null
to_status application_status
applicant_label text
applicant_message text null
internal_reason text null
changed_by_profile_id uuid null
is_system_action boolean default false
effective_at timestamptz default now()
created_at timestamptz
```

### 19.13 `application_change_requests`

```text
id uuid primary key
application_id uuid references applications(id)
field_keys text[]
requested_file_kinds text[]
instructions text
due_at timestamptz null
status open | completed | cancelled
requested_by uuid
completed_at timestamptz null
created_at timestamptz
updated_at timestamptz
```

### 19.14 `application_notes`

```text
id uuid primary key
application_id uuid references applications(id)
body text
note_type general | review | finance | security
created_by uuid
is_pinned boolean default false
created_at timestamptz
updated_at timestamptz null
```

Internal only.

### 19.15 `application_messages`

```text
id uuid primary key
application_id uuid references applications(id)
sender_profile_id uuid null
sender_type applicant | staff | system
visibility applicant | internal
subject text null
body text
parent_message_id uuid null
created_at timestamptz
read_by_applicant_at timestamptz null
read_by_staff_at timestamptz null
```

### 19.16 `payments`

```text
id uuid primary key
application_id uuid unique references applications(id)
status payment_status
currency char(3) null
amount_minor bigint null
proof_application_file_id uuid null
payer_name text null
bank_reference text null
paid_at timestamptz null
submitted_note text null
finance_note text null
verified_by uuid null
verified_at timestamptz null
rejected_reason text null
created_at timestamptz
updated_at timestamptz
```

### 19.17 `invitations`

```text
id uuid primary key
email_normalised text
application_id uuid null references applications(id)
profile_id uuid null references profiles(id)
type applicant | staff
status pending | sent | accepted | expired | revoked | failed
token_hash text null
sent_at timestamptz null
accepted_at timestamptz null
expires_at timestamptz
send_count integer default 0
last_error text null
created_by uuid null
created_at timestamptz
updated_at timestamptz
```

### 19.18 `email_outbox`

```text
id uuid primary key
template_key text
recipient_email text
recipient_profile_id uuid null
application_id uuid null
payload jsonb
status queued | processing | sent | failed | cancelled
attempt_count integer default 0
next_attempt_at timestamptz default now()
provider_message_id text null
last_error_code text null
last_error_summary text null
idempotency_key text unique
created_at timestamptz
sent_at timestamptz null
```

### 19.19 `exports`

```text
id uuid primary key
requested_by uuid references profiles(id)
format xlsx | csv
report_key text
query_snapshot jsonb
status queued | processing | ready | failed | expired
file_id uuid null references files(id)
row_count integer null
expires_at timestamptz
error_summary text null
created_at timestamptz
completed_at timestamptz null
```

### 19.20 `audit_logs`

```text
id uuid primary key
actor_profile_id uuid null
actor_type public | applicant | staff | system
action text
entity_type text
entity_id uuid null
application_id uuid null
before_redacted jsonb null
after_redacted jsonb null
reason text null
metadata_redacted jsonb
ip_hash text null
request_id text null
created_at timestamptz
```

Audit logs are append-only through normal application roles.

### 19.21 `system_settings`

```text
key text primary key
value jsonb
updated_by uuid
updated_at timestamptz
```

Credentials and secrets never belong in this table.

### 19.22 Indexes and search

At minimum:

- unique application reference;
- applications by cycle/status/submitted_at/id;
- applications by payment status;
- applications by reviewer;
- applications by category;
- lower/normalised email;
- normalised telephone where available;
- trigram indexes for nominee name and email search;
- status history by application/effective_at;
- files by purpose/status and application links;
- messages by application/created_at;
- email outbox by status/next_attempt_at;
- exports by requester/status/created_at;
- audit by entity/application/created_at.

Use stable secondary sorting by ID to support cursor pagination.

## 20. Database, File and Permission Enforcement

### 20.1 Defence layers

1. The browser never receives Neon credentials.
2. Every request is authenticated or validated as a permitted public operation.
3. The DAL applies ownership/role permission checks.
4. The database runtime role has least privilege and no DDL rights.
5. PostgreSQL RLS is used as defence in depth on applicant-owned sensitive tables where implemented through a reliable per-transaction context.
6. R2 access is granted only through authorised short-lived signed operations.
7. Every consequential mutation creates an audit record.

### 20.2 Neon roles

Use separate credentials/roles for:

- migrations/administration;
- ordinary application runtime;
- isolated elevated jobs where unavoidable.

Normal page requests must never use the migration owner credential.

When RLS is enabled, implement a helper such as `withDbContext` that starts a transaction and sets local request variables such as authenticated profile ID and effective role before queries. Do not rely on process-global session variables with pooled connections.

### 20.3 Applicant field permissions

Default submitted application fields are locked.

Applicant-editable profile fields:

- profile picture/company logo;
- preferred display name;
- designation;
- profile industry/sector;
- telephone;
- alternate contact email;
- website;
- address and country;
- short biography;
- approved social links.

Permanently or normally locked application fields:

- application reference;
- original submission timestamp;
- original submitted full name/company name;
- original primary email;
- selected award category;
- original declaration and terms versions;
- original file records;
- workflow/payment/account statuses;
- review outcome and status history.

Fields editable only when staff unlocks them for a request:

- current application name/company details;
- designation;
- sector;
- website;
- telephone;
- supporting documents;
- replacement payment proof.

Admin-only fields:

- category changes;
- primary-email/account reassignment;
- status and outcome;
- payment verification;
- reviewer assignment;
- internal notes;
- deletion/restoration controls.

### 20.4 Staff permissions

Use explicit permission checks such as:

```text
applications.view
applications.view_all
applications.edit
applications.change_status
applications.approve
applications.reject
applications.release_outcome
payments.view
payments.verify
files.view
files.manage
messages.send
exports.create
exports.include_sensitive
applicants.manage
staff.manage
settings.manage
audit.view
```

UI visibility is not authorisation. The server checks every permission.

### 20.5 R2 access rules

- Private bucket has no public domain.
- Public bucket is limited to approved brand assets.
- Presigned PUT URLs are object-specific, content-type constrained and short-lived, normally 5–10 minutes.
- Presigned GET URLs are short-lived, normally 1–5 minutes.
- Before creating a GET URL, the server verifies current user access to the linked record.
- R2 CORS allows only approved portal origins and required methods/headers.
- Object keys are generated server-side.
- Delete operations are server-only.
- Replaced or deleted objects follow retention/lifecycle rules rather than disappearing silently.
- Export links expire and the underlying object is deleted after retention.

### 20.6 File validation pipeline

1. Validate manifest before signing.
2. Sign exact expected key and MIME type.
3. Browser uploads directly to R2.
4. Server performs HEAD and confirms size/ETag.
5. Server reads sufficient object bytes, or the whole small file where appropriate, to inspect actual signature.
6. Reject extension/MIME/signature disagreement.
7. Mark valid object `ready`; invalid object remains quarantined/rejected and is not exposed.
8. Image derivatives are produced with `sharp`, metadata stripped and safe dimensions enforced.
9. All file views/downloads use safe `Content-Disposition` and escaped filenames.

Office documents are treated as downloads, not rendered as active HTML. The architecture must leave a hook for malware scanning without making an unavailable external scanner a Release 1 dependency.

## 21. Server Actions, Route Handlers and APIs

### 21.1 Public initiation endpoint

`POST /api/public/applications/initiate`

Input:

- exact form fields;
- declaration acceptance/version;
- file manifest;
- Turnstile token;
- idempotency key;
- honeypot and timing signals.

Server responsibilities:

- validate origin and rate limit;
- verify Turnstile through Siteverify;
- validate cycle open state;
- validate category;
- validate field schema and file manifest;
- create provisional application, payment and upload-session rows;
- allocate generated R2 object keys;
- return presigned PUT URLs and a short-lived opaque upload-session token.

### 21.2 Public completion endpoint

`POST /api/public/applications/complete`

- Validate upload-session token and idempotency key.
- Verify every expected R2 object.
- Validate sizes and detected types.
- Ensure required payment proof exists and optional file count is within limit.
- Create file/application-file records.
- Generate version 1 submission snapshot.
- Generate application reference atomically.
- Set `submitted_at` and statuses.
- Queue confirmation email and audit event.
- Return a typed success result.

A repeat completion request with the same idempotency key returns the same successful reference.

### 21.3 Authenticated actions

Examples:

```text
updateApplicantProfile
beginProfileImageUpload
completeProfileImageUpload
sendApplicantMessage
submitRequestedChanges
replacePaymentProof
changeApplicationStatus
requestApplicationChanges
editApplicationWithReason
assignReviewer
verifyPaymentProof
rejectPaymentProof
resendApplicantInvite
suspendApplicantAccount
createExport
```

Every action must:

1. validate input with Zod;
2. authenticate and authorise;
3. check current record state;
4. enforce idempotency where needed;
5. perform transaction-safe writes;
6. create audit/status/outbox side effects;
7. return a typed user-safe result.

### 21.4 Admin list API

`GET /api/admin/applications`

Typed parameters:

- cursor;
- page size: 25, 50 or 100;
- search;
- cycle;
- workflow status;
- payment status;
- account status;
- category;
- reviewer;
- submitted date range;
- sort key/direction.

Response:

```ts
type CursorPage<T> = {
  rows: T[];
  nextCursor: string | null;
  previousCursor: string | null;
  totalCount?: number;
  filteredCount?: number;
};
```

Counts may be cached briefly where exact real-time counts are not required. Row data must be permission-shaped.

### 21.5 Export API

- Backend reconstructs filters from validated query snapshot.
- Export permissions determine included columns.
- Small exports may complete immediately.
- Larger exports create a queued job and status polling.
- Generated files are written to private R2.
- Download endpoint reauthorises and issues a short-lived URL.

### 21.6 Idempotency and concurrency

Required for:

- public initiate and complete;
- approval and invitation creation;
- status transitions;
- payment verification;
- file finalisation;
- export creation;
- email dispatch.

Use database unique constraints, conditional updates and transaction locks where needed. Do not rely only on disabled buttons.

### 21.7 Error contract

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: string;
      message: string;
      fieldErrors?: Record<string, string[]>;
      errorId?: string;
      retryable?: boolean;
    };
```

Provider/database details belong in structured logs, not user messages.

## 22. Email and Notification System

### 22.1 Provider and sender

Use Resend with React Email templates.

Preferred headers after domain verification:

```text
From: GBE Awards <info@gbeaward.com>
Reply-To: info@gbeaward.com
```

A separate sending subdomain may be used for deliverability while retaining `info@gbeaward.com` as reply-to.

### 22.2 Required templates

- nomination received;
- nomination under review where useful;
- information requested;
- updates received;
- nomination approved and account activation;
- existing account linked to a newly approved nomination;
- invitation reminder;
- invitation expired/resend;
- nomination rejected;
- payment proof verified;
- payment proof rejected/replacement required;
- entry confirmed;
- shortlisted;
- winner;
- not selected;
- new applicant-visible message;
- password reset;
- security/account change;
- staff invitation.

### 22.3 Email quality

- Use the official logo obtained from `gbeaward.com` and served from public R2.
- Use a refined ivory/champagne layout consistent with GBE Maison.
- One dominant action per email.
- Include application reference where relevant.
- Include a plain-text fallback.
- Include `info@gbeaward.com` in the footer.
- Do not reveal internal notes or hidden reasons.
- Do not attach private documents directly unless specifically required; link to the authenticated portal.

### 22.4 Reliable delivery

Business operations insert `email_outbox` rows in the same logical workflow as the state change. A worker sends and records provider IDs.

- Retry transient failures with exponential backoff.
- Do not retry permanent address failures indefinitely.
- Use idempotency keys.
- Expose queued, sent and failed states to authorised staff.
- Resend webhooks update delivery/bounce state when configured.
- A failed email must not roll back an already committed approval; it must surface for retry.

### 22.5 Applicant notifications

The portal notification centre may be implemented through application messages/status events rather than a separate real-time notification service in Release 1. Email remains the primary external notification channel.

## 23. Payment-Proof Workflow

### 23.1 Release 1 model

Release 1 uses payment-slip/screenshot upload and manual verification. Online card payment is not part of the public form or required build.

The cycle stores fee and currency metadata where applicable. The initial nomination includes exactly one proof file unless the cycle marks payment proof unnecessary.

### 23.2 Initial state

On successful public submission:

- create one payment row;
- status `proof_submitted` or `not_required`;
- link the current payment-proof application file;
- retain application and payment statuses separately.

### 23.3 Finance review

Finance can:

- view proof through an authorised short-lived link;
- enter payer name, bank reference, amount and paid date if needed;
- mark under review;
- verify;
- reject with applicant-facing reason;
- waive with elevated permission and reason;
- reverse/refund with elevated permission and audit.

### 23.4 Replacement proof

When proof is rejected:

- applicant sees the reason and a replacement action;
- only one new current proof is accepted at a time;
- new file uses R2 and the standard validation pipeline;
- prior proof becomes non-current but remains in authorised history;
- payment status returns to `proof_submitted` or `under_review`;
- finance is notified.

### 23.5 Entry confirmation

A domain rule may automatically or manually move an approved application to `entry_confirmed` when payment becomes `verified`, `waived` or `not_required` and no other required action remains.

### 23.6 Receipt/confirmation

Where needed, produce a system-generated payment confirmation containing:

- application reference;
- nominee name;
- amount/currency where recorded;
- payment reference/date;
- verification date;
- GBE issuer/contact details;
- statement that it is system generated.

## 24. Admin Portal Requirements

### 24.1 Admin shell

- Light-mode ivory shell with collapsible left navigation.
- Compact global search.
- Current cycle switcher where multiple cycles exist.
- User menu with role, MFA/security and sign out.
- Breadcrumbs only where they improve orientation.
- Desktop-first but fully usable on tablet.
- No heavy dark dashboard or off-the-shelf template styling.

### 24.2 Dashboard

Keep the dashboard operational.

Primary metrics, maximum six:

- total submitted;
- awaiting review;
- action required/resubmitted;
- approved;
- payment proofs awaiting verification;
- shortlisted/winners where released.

Operational panels:

- recent submissions;
- unassigned applications;
- failed emails;
- expiring invitations;
- recent staff activity;
- deadline/cycle state.

Charts are optional and must answer a real question, such as submissions by day or category distribution.

### 24.3 Applications list

Required columns:

- reference;
- full name/company name;
- designation where present;
- category;
- email/phone secondary detail;
- workflow status;
- payment status;
- assigned reviewer;
- submitted timestamp in Colombo;
- last activity;
- row actions.

Required filters:

- cycle;
- workflow status;
- payment status;
- account access status;
- category;
- assigned reviewer;
- submitted date range;
- payment-proof review state;
- has supporting documents;
- action required;
- deleted/archived state for authorised users;
- free-text search.

Search must cover reference, nominee name, email and telephone with indexed backend queries.

### 24.4 Pagination, sorting and URL state

- Backend/cursor pagination is mandatory.
- Default page size 25; options 25, 50 and 100.
- Stable default sort: newest submitted first, then ID.
- Supported sorts: submitted time, last activity, nominee name, status, category.
- Filters, search, sort and page size are represented in URL query state through `nuqs` or equivalent.
- Browser back/forward restores the exact list state.
- Search is debounced and cancellable.
- Changing filters resets the cursor appropriately.
- Show clear result count where reasonably efficient.
- Never fetch all applications into the browser merely to paginate or filter.

### 24.5 List interaction quality

- Initial rows server-rendered.
- Subsequent page/filter requests keep the table frame stable.
- Use subtle skeleton rows, not spinners replacing the page.
- Row hover and focus states are clear.
- Bulk-selection state survives only while logically safe.
- Safe mutations use optimistic feedback with rollback; high-risk transitions wait for confirmed success.
- Refresh only affected queries.
- Empty states explain how to clear filters.

### 24.6 Quick actions and bulk actions

Row actions:

- open;
- assign reviewer;
- change permitted status;
- request information;
- approve/reject;
- resend invite/email;
- export record;
- archive/restore according to permission.

Bulk actions:

- assign reviewer;
- send an approved communication template;
- change a safe status;
- export selected;
- archive selected where permitted.

Bulk approval/rejection remains disabled by default unless a future policy explicitly enables it with safeguards.

### 24.7 Application detail page

Sections:

1. sticky summary and primary actions;
2. submitted nomination details;
3. current edited values and original-version comparison;
4. category and cycle;
5. supporting documents;
6. payment proof and finance decision;
7. applicant profile/account state;
8. messages;
9. internal notes;
10. change requests and unlocked fields;
11. status timeline;
12. version history;
13. audit activity.

The action panel displays only valid transitions for the current status and permission.

### 24.8 Full editing capability

Authorised administrators must be able to correct operational data without database access.

- Edit nomination name/company, designation, sector, website, email, telephone and category.
- Add, replace, mark superseded or remove current file links according to retention rules.
- Correct payment data.
- Link or reassign an applicant account.
- Change reviewer and statuses.
- Edit applicant profile fields.
- Restore soft-deleted records.

Rules:

- A reason is mandatory for submitted-data edits.
- Before/after data is audited.
- A new application version is created.
- Primary-email/category/account changes require elevated confirmation.
- System IDs, original version and audit records cannot be destructively edited through normal UI.

### 24.9 Applicant/account management

Pages must support:

- search and pagination;
- profile view/edit;
- linked applications;
- account/invitation status;
- resend/revoke invite;
- suspend/reactivate with reason;
- send password-reset email;
- revoke sessions where supported;
- change role only for staff through the staff area;
- read-only **View applicant experience** mode without impersonated mutations.

Never display or manually set an applicant's password.

### 24.10 Payment administration

Dedicated queue with:

- proof preview/download;
- application and payer context;
- verify/reject/waive actions;
- reason/note fields;
- current and prior proof versions;
- status filters;
- finance export.

### 24.11 File administration

- Search by application reference, filename, purpose and status.
- View validation status, detected MIME, size, object creation time and links.
- Re-run safe validation where supported.
- Mark rejected/superseded.
- Delete only under retention permission.
- No direct display of R2 access credentials or raw permanent object URLs.

### 24.12 Categories and cycles

- Create/edit/reorder categories.
- Activate/deactivate categories.
- Import categories from a validated CSV if useful.
- Configure cycle dates, text, fee/currency, declaration, support email and brand key.
- Open/close submissions through guarded actions.
- Prevent destructive changes that would invalidate historical submissions.

### 24.13 Communications

- List queued, sent, delivered, bounced and failed messages where provider data exists.
- Filter by template/application/recipient/status/date.
- Preview sanitised template rendering.
- Retry failed transactional messages.
- Send an approved manual message to one or selected applicants.
- Record sender, recipients, template, subject, time and provider ID.

### 24.14 Excel and CSV exports

Required export types:

- full application register;
- filtered current application view;
- selected applications;
- applicant contacts;
- category summary;
- workflow status report;
- payment reconciliation;
- document/file report;
- shortlisted list;
- winner list;
- communication delivery report;
- audit report for super administrators.

Excel requirements:

- true `.xlsx` generated with `exceljs`;
- clear workbook title and generated-at metadata;
- frozen header row;
- table filters;
- sensible column widths and wrapped text;
- dates displayed in Asia/Colombo with timezone clarity;
- hyperlinks for valid website/email fields where safe;
- separate sheets when a report includes applications, payments and file summaries;
- no embedded private proof/document content;
- formulas avoided unless necessary and protected from CSV/Excel formula injection.

CSV requirements:

- UTF-8;
- predictable headers;
- RFC-compatible escaping;
- prevent spreadsheet formula injection by neutralising dangerous leading characters;
- documented date/time format.

Export security:

- backend rebuilds the query;
- role-based column inclusion;
- sensitive exports require explicit permission;
- creation and download audited;
- file stored in private R2;
- signed download expires quickly;
- object automatically deleted after the configured retention, default 24 hours.

### 24.15 Settings and audit pages

Settings include:

- support contact;
- cycle defaults;
- bank/payment instructions;
- email templates;
- brand asset keys;
- invitation expiry;
- retention periods;
- feature flags.

Audit page supports actor, action, entity, application reference and date filters with server pagination. Audit records are read-only.

## 25. Applicant Portal Requirements

### 25.1 Overview dashboard

Above the fold:

- personalised greeting;
- official application reference;
- current status badge and explanation;
- next required action;
- payment state;
- latest important date;
- primary action button where required.

Below:

- status timeline;
- recent messages;
- requested changes/documents;
- profile completion prompt where useful;
- support card containing `info@gbeaward.com`.

### 25.2 Application view

- Read-only original/current application information by default.
- Clearly label submitted information and any approved current correction.
- Show selected category, submission timestamp and payment state.
- Display only applicant-facing status messages.
- Do not expose internal notes, reviewer-only reasons or raw audit metadata.
- Provide a downloadable summary when enabled.

### 25.3 Editable profile data

Applicant may edit:

- profile picture or organisation logo;
- preferred display name;
- current designation;
- current industry/sector for profile use;
- telephone;
- alternate contact email;
- business website;
- address, city/region, postal code and country;
- short biography/profile;
- approved social links.

These profile changes do not rewrite the original submitted nomination snapshot.

### 25.4 Locked data treatment

Normally locked:

- official submitted full name/company name;
- primary login email;
- application reference;
- original submission timestamp;
- award category;
- original payment proof and supporting-file history;
- application/payment/account statuses;
- review outcome;
- declaration and terms versions.

The UI must show a lock icon only where useful, use a subdued locked surface and explain: `This information forms part of your official submitted nomination. Contact info@gbeaward.com if a correction is required.`

### 25.5 Requested edits

When staff unlocks fields:

- dashboard shows an action-required card;
- application page highlights only editable fields;
- instructions and due date remain visible;
- save may occur locally/in form state, but final **Submit updates** creates a new version;
- after submission, fields lock again;
- applicant receives confirmation.

### 25.6 Profile-picture experience

- Accept JPEG, PNG or WebP up to 5 MiB.
- Present circular or rounded-square crop preview based on account kind.
- Correct EXIF orientation.
- Strip metadata.
- Generate 512×512 and 96×96 WebP derivatives with `sharp`.
- Keep original private.
- Use signed/proxied access for private variants or a carefully authorised image delivery route.
- Provide remove/replace actions with confirmation.
- Use skeleton/avatar initials while loading, avoiding layout shift.

### 25.7 Documents

- Group supporting, payment and requested documents.
- Show current version, upload time, type and review state.
- Download through authorised short-lived links.
- Applicant cannot delete original submitted files.
- Replacement flows preserve prior versions.

### 25.8 Messages

- Chronological thread, not live chat.
- Unread indicator.
- Safe plain text or tightly controlled formatting.
- Email notification for new staff messages.
- Attachments normally use the document request area.

### 25.9 Profile edit UX

- Autosave is not required for every keystroke.
- Use explicit **Save changes** with dirty-state indication.
- Safe small mutations may update optimistically after server acceptance.
- Preserve unsaved input when a recoverable network error occurs.
- Success feedback is quiet and clear.
- Validation messages use plain language.

### 25.10 Security

- Change password.
- View/revoke sessions where supported cleanly.
- Optional applicant MFA may be enabled later.
- Primary-email change is a verified support/security process.
- Account deletion is a request process because award records may require retention.

## 26. Security Requirements

### 26.1 General

- Follow least privilege and OWASP-aligned secure defaults.
- Validate every input server-side.
- Use parameterised Drizzle queries.
- Never render untrusted HTML.
- Keep Neon, R2, Resend, Better Auth and Redis secrets server-only.
- Use separate development, staging and production resources.
- Require MFA for all production staff.
- Record security-relevant events with request IDs.

### 26.2 Turnstile

Turnstile is mandatory on the final public nomination submission.

Server validation must check:

- `success`;
- expected hostname (`portal.gbeawards.com` and approved non-production hosts);
- expected action name;
- token freshness/single use according to Cloudflare behaviour;
- optional remote IP when appropriate and privacy-compliant.

Use Cloudflare official test keys in automated tests. Do not bypass verification logic in test builds.

### 26.3 Rate limiting

At minimum:

- public submission initiate and complete;
- upload presign requests;
- login and password reset;
- invite acceptance/resend;
- applicant messages;
- profile/file uploads;
- status mutations;
- export generation/download;
- email retries.

Keys combine relevant IP signal, email hash, profile ID and action without unnecessarily storing PII.

### 26.4 CSRF, origin and headers

- Validate origin/host on sensitive custom endpoints.
- Use same-origin cookies and framework protections.
- Configure CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy and `frame-ancestors`.
- CSP explicitly permits required portal, Turnstile and approved R2 public-asset domains; avoid broad wildcards.
- Webhooks use provider-specific verification.

### 26.5 File security

- Private-by-default R2.
- Exact count and byte limits.
- Extension, claimed MIME and detected signature checks.
- No SVG, HTML, executable, archive or macro-enabled Office uploads.
- Object names generated by server.
- File metadata escaped.
- Safe download disposition.
- Images re-encoded for profile use.
- Payment proofs and documents are never indexed or exposed through public asset domains.
- Quarantine/reject invalid files before allowing staff/applicant access.

### 26.6 Authentication security

- Public sign-up disabled in Better Auth.
- Passwords handled only by Better Auth.
- No generated password sent by email.
- Invitation/reset tokens single use and expiring.
- Password reset revokes other sessions.
- Staff MFA mandatory.
- Suspended account checks on every request.
- Sensitive account changes send security notifications.

### 26.7 Export security

- Prevent CSV/Excel formula injection.
- Permission-shape columns.
- Private R2 storage.
- Short expiry.
- Audit creation and download.
- Never include raw auth/session data, internal secrets or private object keys.

### 26.8 Sensitive-data logging

Never log:

- passwords;
- auth/invitation/reset tokens;
- Turnstile tokens;
- full payment proof contents;
- full application payloads;
- R2 secrets or presigned URLs;
- database connection strings;
- unredacted personal data in error traces.

## 27. Privacy, Retention and Data Governance

### 27.1 Privacy principles

- Collect only information required to administer the awards and applicant account.
- Explain the purpose of nomination, payment-proof and profile data.
- Keep private documents and payment proof separate from public brand assets.
- Restrict access by role and application ownership.
- Provide `info@gbeaward.com` for privacy and correction requests.
- Do not use applicant information for unrelated promotion without an appropriate separate legal basis/consent.

### 27.2 Configurable retention baseline

Final periods must be approved by GBE management and appropriate legal/privacy advisers. The system must support at least:

- provisional/incomplete upload sessions and orphaned R2 objects: delete after 24 hours by default;
- expired invitations and verification records: remove or minimise after their operational/security retention period;
- export objects: delete after 24 hours by default;
- failed/temporary file objects: delete after a short quarantine period;
- transactional email logs: retain delivery metadata without unnecessary content;
- submitted award records and payment verification: retain according to official awards, accounting and legal policy;
- audit logs: retain longer where necessary for accountability;
- profile images replaced by a new image: retain only according to rollback/retention policy, then delete from R2.

R2 lifecycle rules and scheduled database jobs must agree. A database file row must not claim an object is available after lifecycle deletion.

### 27.3 Deletion, archive and anonymisation

- Hard deletion is not a routine admin action.
- Use archive and soft delete for ordinary lifecycle management.
- Restore remains available to authorised staff while retention permits.
- Valid deletion requests must preserve only legally required minimal records and anonymise where appropriate.
- Destructive actions require super-admin permission, reason and audit.
- Deleting a database relationship must not leave an inaccessible orphaned R2 object.
- Deleting an R2 object must not remove the historical fact that a file existed where audit requirements require that fact.

### 27.4 Data export and access requests

A privacy access/export process must use dedicated permission-shaped reports, not raw database dumps. Exclude passwords, sessions, internal security metadata, private object keys and unrelated staff notes.

## 28. Analytics

Analytics is optional behind a feature flag and must never capture form values, personal data, document names or private URLs.

Permitted product events:

```text
apply viewed
application submit attempted
application upload started
application upload completed
application submitted
login succeeded
portal viewed
profile updated
requested changes submitted
admin application opened
admin filter changed
export requested
export downloaded
```

Rules:

- Do not send email, phone, nominee name, application response values, file names or references as analytics properties.
- Disable session replay on authenticated/private pages unless a future privacy review explicitly approves fully masked capture.
- Respect consent requirements applicable to the deployment.
- Operational audit logs are not analytics and remain server-side.

## 29. Logging and Operational Visibility Without Sentry

Release 1 deliberately excludes Sentry.

Implement:

- structured server logs containing request ID, action, safe entity ID, result and duration;
- user-visible error IDs for unexpected failures;
- Vercel function/runtime logs;
- Neon query/connection monitoring and application health checks;
- Cloudflare Turnstile/R2 operational dashboards;
- database audit events for business actions;
- email failure dashboard through `email_outbox`;
- export and cleanup job status;
- health endpoint for basic dependency readiness without exposing secrets;
- scheduled checks for stuck email jobs, stale uploads, failed exports and repeated provider failures;
- admin activity view for business events.

Do not log full form payloads, presigned URLs, private object keys, auth tokens or secrets. Do not treat console logs as a permanent audit system; business events belong in append-only database audit records.

A later release may add a dedicated error-monitoring platform only after approval and privacy/configuration review.

## 30. Performance and UX Quality Requirements

### 30.1 Public page

- Keep `/apply` mostly server-rendered.
- Load only the client code required for form controls, Turnstile and uploads.
- Defer non-essential decorative animation.
- Prevent layout shift when Turnstile or file rows appear.
- Use public R2/CDN brand assets with responsive dimensions.
- Target good Core Web Vitals on a typical mid-range mobile connection.

### 30.2 Uploads

- Direct browser-to-R2 transfer; do not proxy file bytes through Vercel unless processing requires it.
- Per-file progress and retry.
- Limit concurrent uploads, recommended two or three.
- Abort support when leaving/cancelling.
- No base64 file transfer.
- Preserve successful uploaded objects during short retries.

### 30.3 Admin lists

- Cursor/backend pagination.
- Indexed search and filters.
- Select only required columns.
- Avoid N+1 queries.
- Prefetch next page only when beneficial.
- Debounce search and cancel stale requests.
- Stable skeletons and transitions.
- Virtualisation is unnecessary for ordinary paginated pages but may be used for unusually large local sublists.

### 30.4 Database

- Review query plans for the main application list, search, payment queue and exports.
- Add indexes based on real filters.
- Use pooled Neon connections appropriate to Vercel.
- Use transaction-capable connections for workflows requiring atomic writes.
- Avoid unbounded queries and offset scans at high page numbers.

### 30.5 Images and glass effects

- Profile thumbnails are derived, not full originals.
- Blur/backdrop filters are limited to surfaces where they materially improve hierarchy.
- Provide graceful fallback when `backdrop-filter` is unsupported.
- Do not animate expensive blur, large box shadows or background filters continuously.
- Respect `prefers-reduced-motion`.

### 30.6 Perceived quality

The product must not show abrupt content jumps, duplicate toasts, full-page spinners for local changes, stale status after successful actions or rough browser-default file controls. Every asynchronous operation needs loading, success, empty, recoverable error and unrecoverable error behaviour.

## 31. SEO and Metadata

### 31.1 Indexable

- `/apply` may be indexable with clear title, description, canonical and social image.
- `/privacy`, `/terms` and public help may be indexable as appropriate.

### 31.2 Noindex

Use `noindex, nofollow` for:

- all in-progress application routes;
- receipt/status token routes;
- authentication routes;
- applicant portal;
- admin portal;
- API routes.

### 31.3 Metadata

Suggested public title:

```text
Apply for the GBE Awards 2026 | Global Business Excellence Awards
```

Suggested description:

```text
Submit your application for the Global Business Excellence Awards 2026 and showcase outstanding achievement, innovation and impact.
```

Final public copy should align with the main GBE Awards website.

---

## 32. Testing Strategy

### 32.1 Unit tests

Cover:

- public form Zod schema;
- URL/phone normalisation;
- file manifest rules;
- category/cycle validation;
- application reference generation;
- status transitions;
- field-lock decisions;
- permission checks;
- Colombo date formatting;
- Excel/CSV formula-injection protection;
- R2 object-key generation;
- email template data shaping.

### 32.2 Integration tests

Use a test Neon branch/database and isolated R2 test bucket or mocked S3-compatible layer as appropriate.

Cover:

- initiate → presign → complete public submission;
- Turnstile server validation and failures;
- upload-session expiry and idempotency;
- R2 HEAD/type/size mismatch rejection;
- approval → account creation/link → invitation;
- invite expiry/resend;
- Better Auth session and staff MFA requirements;
- applicant ownership isolation;
- locked/editable field enforcement;
- application version creation on edits;
- payment-proof replacement;
- email outbox retry;
- export permission and file expiry;
- cursor pagination and filter correctness.

### 32.3 Playwright critical journeys

1. Submit a valid nomination with payment proof and optional supporting files.
2. Recover from one failed file upload and submit without duplicating successful files.
3. Reject invalid type, oversize file, too many files and missing declaration.
4. Admin finds the application through search/filter/pagination.
5. Admin reviews payment proof and application.
6. Admin approves and sends account activation.
7. Applicant activates account and logs in.
8. Applicant updates profile picture and editable profile fields.
9. Applicant cannot edit locked application fields.
10. Admin requests changes to selected fields; applicant resubmits them.
11. Finance rejects and applicant replaces payment proof.
12. Admin creates and downloads a filtered Excel export.
13. Reviewer cannot access forbidden settings or applications.
14. Staff without MFA cannot enter production admin content.

### 32.4 Accessibility tests

- automated axe checks on core pages;
- keyboard-only form and admin table operation;
- focus management after validation, dialogs and route changes;
- screen-reader labels for file status/progress;
- reduced-motion behaviour;
- colour contrast for glass surfaces and status badges.

### 32.5 Test data rules

- Never use real applicant documents or payment slips in automated tests.
- Use generated safe fixtures.
- Use Cloudflare official Turnstile test credentials.
- Test environments use separate R2 prefixes/buckets and Neon branches.

## 33. Deployment and Environments

### 33.1 Environments

```text
local
preview
staging
production
```

Each non-local environment must have appropriately isolated:

- Neon branch/database and runtime role;
- Better Auth base URL/secret;
- R2 bucket or strict environment prefix;
- Turnstile site/secret configuration;
- Resend domain/key or safe test sender;
- Redis/rate-limit namespace;
- application URL and allowed origins.

### 33.2 Hosting and domains

- Deploy Next.js to Vercel.
- Configure `portal.gbeawards.com` as the production domain through Cloudflare DNS.
- Keep `gbeaward.com` as the official source site and logo source.
- Use `info@gbeaward.com` as support/reply contact.
- Configure a public R2 custom asset domain if used.
- Do not expose the private R2 bucket through a custom public domain.

### 33.3 Neon

- Migrations run through Drizzle Kit in controlled CI/release workflow.
- Production schema changes are versioned and reviewed.
- Use Neon branching for preview/staging where practical.
- Verify backups/point-in-time recovery according to the selected Neon plan.
- Use pooled runtime connection and separate migration/direct connection where required.

### 33.4 Cloudflare R2

- Configure private and public buckets/prefixes.
- Create least-privilege API credentials.
- Configure CORS only for approved portal origins.
- Configure lifecycle cleanup for exports, abandoned uploads and deleted/orphaned objects.
- Test presigned PUT/GET against production-like hostnames before launch.

### 33.5 Deployment gates

Before production:

- typecheck;
- lint;
- unit/integration tests;
- critical Playwright tests;
- migration dry run;
- environment verification script;
- security-header check;
- R2 CORS and upload test;
- Turnstile hostname/action validation test;
- email-domain verification;
- staff MFA test;
- export test;
- accessibility smoke test.

### 33.6 Release process

- Deploy migration-compatible code.
- Apply migrations through controlled pipeline.
- Seed only required cycle/category/admin bootstrap data.
- Verify health and critical flows.
- Open the cycle through an admin setting only after all checks pass.
- Maintain a rollback plan for code and compatible database changes.

## 34. Environment Variables

Illustrative names:

```text
NEXT_PUBLIC_APP_URL=https://portal.gbeawards.com
APP_ENV=production
APP_TIMEZONE=Asia/Colombo
SUPPORT_EMAIL=info@gbeaward.com
OFFICIAL_SITE_URL=https://gbeaward.com

DATABASE_URL=
DATABASE_URL_DIRECT=

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://portal.gbeawards.com

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_PRIVATE_BUCKET=gbe-portal-private
R2_PUBLIC_BUCKET=gbe-portal-public
R2_PUBLIC_ASSET_BASE_URL=

NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_EXPECTED_HOSTNAME=portal.gbeawards.com
TURNSTILE_APPLICATION_ACTION=gbe_nomination_submit

RESEND_API_KEY=
EMAIL_FROM=GBE Awards <info@gbeaward.com>
EMAIL_REPLY_TO=info@gbeaward.com

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

CRON_SECRET=
POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

Rules:

- Validate required variables at startup/build using a typed environment schema.
- Never prefix secrets with `NEXT_PUBLIC_`.
- Never commit production values.
- Preview environments must not send real applicant emails without an explicit safe-recipient mechanism.
- R2 presigned URLs and DB connection strings must never be logged.

## 35. Development Scripts

Recommended scripts:

```text
bun dev
bun build
bun start
bun lint
bun typecheck
bun test
bun test:watch
bun test:e2e
bun test:e2e:ui
bun db:generate
bun db:migrate
bun db:migrate:prod
bun db:seed
bun db:studio
bun env:verify
bun email:preview
bun check
```

`bun check` should run formatting/lint, typecheck and the required test subset.

Database migration commands must clearly distinguish local/staging from production. No production migration should be hidden inside ordinary application startup.

## 36. Feature Flags

Feature flags may live in validated database settings plus environment-level kill switches.

Initial flags:

```text
applications_enabled
applicant_messages_enabled
profile_social_fields_enabled
applicant_mfa_enabled
outcome_visibility_enabled
analytics_enabled
excel_exports_enabled
csv_exports_enabled
```

Rules:

- Security checks do not depend solely on client flags.
- Disabling applications prevents new initiation and completion while preserving admin access.
- Outcome visibility remains separate from internal outcome status.
- Online payment is future scope and must not appear as a half-built Release 1 flag.

## 37. Scheduled Jobs and Background Work

Required jobs:

### 37.1 Email outbox

- Process queued messages.
- Retry transient failures with backoff.
- Record final failure state.

### 37.2 Stale upload cleanup

- Expire provisional upload sessions after the configured lifetime.
- Delete orphaned R2 objects not linked to finalised records.
- Mark provisional database records expired rather than silently treating them as submissions.

### 37.3 Export cleanup

- Mark exports expired.
- Delete corresponding private R2 objects.
- Keep the audit/export metadata according to policy.

### 37.4 Invitation reminders and expiry

- Send a limited reminder before expiry.
- Mark expired invitations.
- Never continue sending indefinitely.

### 37.5 Retention cleanup

- Execute only explicitly approved retention rules.
- Prefer soft deletion and review queues before irreversible removal.
- Write audit records for destructive actions.

Jobs may be triggered through Vercel Cron, QStash or another approved scheduler. Endpoints require a cron secret and must be idempotent. The product UI should expose job failures that need staff attention.

## 38. Reference and Numbering Rules

### 38.1 Application reference

Format:

```text
GBE-2026-000001
```

- generated only at successful final submission;
- sequence unique within cycle;
- generation must be concurrency safe;
- never reused after withdrawal or rejection.

### 38.2 Payment/receipt references

Suggested:

```text
PAY-2026-000001
RCT-2026-000001
```

Use database-backed concurrency-safe sequences.

### 38.3 Display rules

- use monospaced/tabular numeric treatment where helpful;
- allow copy button;
- reference appears in emails, receipts, admin lists and applicant header;
- internal UUIDs are never displayed as primary references.

---

## 39. Data Validation Rules

### 39.1 Public form

- `nominee_name`: required, 2–180 trimmed characters.
- `designation`: optional, maximum 120.
- `industry_sector`: required, maximum 160.
- `business_website`: optional valid HTTP(S) URL, maximum 500.
- `email`: required, valid email shape, maximum 320, normalised for matching.
- `phone`: required, international-safe validation; store E.164 where possible.
- `category_id`: active and belongs to current open cycle.
- declaration: exactly accepted against current version.
- Turnstile: successful server validation.
- supporting files: 0–5, each ≤ 5 MiB, allowed types only.
- payment proof: exactly 1 when required, ≤ 5 MiB, allowed types only.

### 39.2 Profile

- display name: 2–180.
- designation/industry: maximum 160.
- phone: valid supported international format.
- alternate email: valid and different from login email where required.
- website/social URLs: HTTP(S), allow-listed host rules only where needed.
- short bio: maximum 1,000 characters.
- profile image: JPEG/PNG/WebP, ≤ 5 MiB, valid detected image, minimum sensible dimensions and maximum pixel count.

### 39.3 Admin mutations

- Submitted-data edit requires non-empty reason, minimum 8 meaningful characters.
- Category change requires category active in the same cycle unless elevated historical correction.
- Primary email change checks account conflicts.
- Status transition must be valid from current state.
- Change request requires at least one field/file and clear instructions.
- Rejection requires applicant-facing reason.
- Payment verification requires a current proof unless status is waived/not required.
- Bulk operations have maximum batch sizes and permission checks.

### 39.4 Sanitisation and normalisation

- Trim ordinary text.
- Preserve meaningful Unicode.
- Normalise line endings.
- Never silently title-case names.
- Neutralise formula-leading characters in exports.
- Store raw/display and normalised email/phone values where needed.
- Do not treat client-supplied MIME/extension as authoritative.

## 40. Empty, Loading and Failure States

Every major page and operation must define:

- initial loading skeleton;
- empty state;
- pending mutation state;
- recoverable error state;
- permission-denied state;
- not-found state;
- expired invitation/reset state;
- offline/network-retry guidance where relevant.

### 40.1 Public form failures

- Field errors remain next to fields and in an accessible summary.
- Turnstile expiry asks the user to retry verification without clearing form values.
- A failed upload shows the failed file and retry action while preserving successful uploads for the active upload session.
- A completion timeout checks idempotent submission status before asking the user to submit again.
- Never show a success reference until the server confirms finalisation.

### 40.2 Applicant empty states

If no approved application is linked, explain the situation and show `info@gbeaward.com`. Do not show a broken dashboard or a button to public sign-up.

### 40.3 Admin list states

- No records in cycle: explain that nominations have not been received.
- No filtered results: show active filter summary and **Clear filters**.
- Failed list request: preserve filters and provide retry.
- Deleted/archived records remain clearly identified.

### 40.4 Profile save failures

Keep unsaved form values in memory, display a calm persistent warning and allow retry. Do not imply that data was saved. Profile-image processing failures must keep the previous image active.

### 40.5 Expired links

Invitation and password-reset pages explain that the link has expired or was already used and provide the correct resend/support route without revealing whether unrelated accounts exist.

## 41. Build Phases

### Phase 1 — Foundation

- repository and strict TypeScript;
- Tailwind/shadcn/Base UI foundation;
- GBE Maison tokens and shells;
- Neon/Drizzle schema and migrations;
- Better Auth base configuration;
- R2 clients/buckets/CORS;
- environment validation;
- official logo retrieval from `gbeaward.com` and R2 brand setup.

### Phase 2 — Public nomination

- `/apply` visual page;
- exact field schema;
- category loading;
- file selector and progress UX;
- Turnstile;
- initiate/complete APIs;
- R2 validation/finalisation;
- reference generation;
- confirmation page/email;
- stale upload cleanup.

### Phase 3 — Admin core

- staff auth/MFA;
- admin shell/dashboard;
- applications list with backend pagination/search/filters/URL state;
- application detail;
- files/payment proof viewer;
- notes, assignment and audit;
- status transition service.

### Phase 4 — Approval and applicant accounts

- invitation/account creation;
- email activation and password setup;
- applicant shell/dashboard;
- application/status/payment views;
- profile fields;
- profile image R2 processing;
- security/password pages.

### Phase 5 — Changes, messages and payments

- field unlock/change request;
- applicant resubmission/versioning;
- messages;
- payment review/replacement;
- entry confirmation rules.

### Phase 6 — Operations

- categories/cycles/settings;
- staff and applicant management;
- communication queue UI;
- Excel/CSV exports;
- export jobs/R2 expiry;
- audit search;
- soft deletion/restoration.

### Phase 7 — Hardening and launch

- performance profiling/indexes;
- accessibility review;
- security headers and rate limits;
- integration/E2E tests;
- production environment and domain;
- email deliverability;
- backup/retention validation;
- launch checklist and monitoring.

## 42. Definition of Done

A feature is complete only when:

- product behaviour matches this specification;
- responsive and keyboard behaviour is finished;
- loading, empty, success, validation, recoverable error and fatal error states exist;
- server-side validation and permission checks exist;
- audit side effects exist where required;
- relevant files use R2 and not local/Vercel storage;
- Neon migration/index changes are included;
- tests cover core behaviour and negative permissions;
- no sensitive values are logged or exposed;
- copy uses UK English;
- dates display correctly in Asia/Colombo;
- reduced-motion and accessibility behaviour are supported;
- the experience has no known rough transitions, layout jumps or stale post-mutation states;
- documentation/environment examples are updated.

## 43. Release 1 Acceptance Criteria

### Public submission

- `/apply` contains only the exact specified fields, declaration and Turnstile.
- Timestamp is server-generated and displayed/exported in Colombo time.
- Supporting documents accept up to five approved files at 5 MiB each.
- Payment proof accepts one approved file at 5 MiB.
- Direct R2 upload has progress/retry and validates server-side.
- Invalid/oversized/disguised files are rejected.
- Turnstile is server validated.
- Duplicate completion returns the same reference rather than creating a second application.
- Successful submission creates version 1, statuses, files, payment record, audit and confirmation email.

### Admin

- Staff MFA is required.
- Applications list has backend pagination, indexed search, filters, sorting and URL state.
- Admin can view all relevant submission/payment/file data allowed by role.
- Admin can edit required fields with a reason and full audit/version history.
- Admin can request selected changes, approve, reject, assign and release outcomes according to permission.
- Payment proof can be verified/rejected/waived.
- Applicant accounts/invitations can be managed.
- Excel and CSV exports are role-shaped, private, expiring and audited.

### Applicant

- No login exists before approval.
- Approval creates or links an account and sends activation.
- Applicant can log in and see status, payment, documents and messages.
- Applicant can edit permitted profile fields and profile image.
- Applicant cannot edit locked official fields.
- Selected fields become editable only during an active request.
- Resubmission creates a new version and re-locks fields.
- Payment proof replacement retains prior history.

### Security and operations

- Browser has no Neon/R2 privileged credentials.
- Private files require current authorisation and short-lived access.
- Staff role restrictions work server-side.
- Audit logs are append-only in normal operation.
- Stale uploads and exports are cleaned safely.
- Critical Playwright tests pass.
- Production domain, email, R2 CORS, Neon migrations and Turnstile hostname are verified.

## 44. Agent Implementation Rules

1. Treat this document as the development baseline.
2. Use UK English in UI and emails.
3. Use `Asia/Colombo` for display/business dates and UTC in storage.
4. Use Neon PostgreSQL, not Supabase or another database.
5. Use Cloudflare R2 for every runtime-managed file; never use Vercel/local disk for persistence.
6. Use Better Auth with public sign-up disabled.
7. Do not create an applicant account before approval.
8. Do not add fields to the public nomination form beyond Section 9.
9. Use Turnstile and validate it server-side.
10. Do not hotlink the GBE logo; retrieve the official asset from `gbeaward.com`, optimise it and store approved variants in R2.
11. Do not expose permanent private-file URLs.
12. Preserve original submission version 1.
13. Do not let applicants alter locked application data.
14. Let authorised admins perform necessary corrections through audited UI rather than direct DB edits.
15. All admin lists use backend pagination/filtering/search.
16. All exports are generated server-side, permission-shaped and stored privately.
17. Do not add Sentry.
18. Do not add online card payment to Release 1.
19. Avoid generic dashboard templates and excessive cards.
20. Glassmorphism must follow Section 12 and never reduce readability.
21. Motion must be subtle, interruptible and reduced-motion compliant.
22. Every asynchronous action needs polished loading/success/error behaviour.
23. Do not invent secrets, bank details, legal terms, category names or results.
24. Use central domain services for statuses, invitations, files and audit.
25. Never bypass permissions because a route is hidden in the UI.

## 45. Configurable Items Before Content Lock

These may be changed through configuration without changing architecture:

- final cycle opening/closing/result dates;
- active category names/order;
- nomination fee and currency;
- bank/payment instructions;
- exact public intro copy;
- terms/privacy URLs and versions;
- declaration version while preserving the exact required checkbox sentence;
- invitation expiry and reminder timing;
- email sender subdomain;
- R2 public asset custom domain;
- support telephone if one is added;
- profile social fields enabled/disabled;
- outcome release timing;
- export retention duration;
- data retention periods;
- PostHog enablement.

Fixed decisions unless this specification is deliberately revised:

- minimal one-page public form;
- exact public field set;
- Neon database;
- Cloudflare R2 files;
- approval-first applicant account;
- `info@gbeaward.com` support email;
- Asia/Colombo display timezone;
- no public sign-up;
- no online card payment in Release 1;
- no Sentry.

## 46. Future-Compatible Extensions

The architecture should permit, without implementing now:

- judge accounts and scoring;
- panel assignments and conflict declarations;
- online payments;
- public nominee directory;
- voting;
- certificate generation and verification;
- ticket/table management;
- WhatsApp notifications;
- multilingual content;
- public profile publishing from approved profile data;
- CRM integration;
- advanced malware scanning pipeline;
- object retention/legal holds;
- external BI warehouse;
- additional observability provider if later approved.

Future features must build on the application/version/file/audit models rather than rewriting the original submission history.

## 47. Initial Design Tokens Example

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-manrope);
  --font-display: var(--font-cormorant);

  --color-background: #f8f6f1;
  --color-background-elevated: #fbfaf6;
  --color-surface: #fffdf8;
  --color-surface-strong: #ffffff;
  --color-ink: #171713;
  --color-graphite: #45443e;
  --color-muted: #747168;
  --color-mist: #e8e5dd;
  --color-mist-strong: #dad5ca;
  --color-champagne: #c6a969;
  --color-antique-gold: #9d7d3f;
  --color-pale-gold: #ead9a5;
  --color-gold-wash: #f4ecd8;
  --color-bronze-ink: #6d552b;

  --radius-sm: 0.625rem;
  --radius-md: 0.875rem;
  --radius-lg: 1.125rem;
  --radius-xl: 1.5rem;
  --radius-2xl: 1.875rem;
}

:root {
  color-scheme: light;
}

body {
  background:
    radial-gradient(circle at 12% 8%, rgba(198, 169, 105, 0.12), transparent 30%),
    radial-gradient(circle at 88% 6%, rgba(121, 112, 92, 0.08), transparent 28%),
    #f8f6f1;
  color: #171713;
}

.gbe-glass-shell {
  background: rgba(255, 253, 248, 0.76);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 10px 34px rgba(35, 30, 20, 0.055);
  -webkit-backdrop-filter: blur(20px) saturate(125%);
  backdrop-filter: blur(20px) saturate(125%);
}

.gbe-glass-feature {
  background: linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.74),
    rgba(255, 253, 248, 0.58)
  );
  border: 1px solid rgba(255, 255, 255, 0.84);
  box-shadow:
    0 24px 70px rgba(35, 30, 20, 0.075),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  -webkit-backdrop-filter: blur(24px) saturate(130%);
  backdrop-filter: blur(24px) saturate(130%);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .gbe-glass-shell,
  .gbe-glass-feature {
    background: rgba(255, 253, 248, 0.98);
  }
}
```

This is an initial baseline, not permission to bypass component-level contrast testing.

---

## 48. Official Technical References

The implementation agent should consult current official documentation and lock compatible stable versions at development start:

- Next.js App Router: `https://nextjs.org/docs/app`
- Tailwind CSS: `https://tailwindcss.com/docs`
- shadcn/ui: `https://ui.shadcn.com/docs`
- Base UI: `https://base-ui.com/react/overview/quick-start`
- Neon Next.js: `https://neon.com/docs/guides/nextjs`
- Neon serverless driver: `https://neon.com/docs/serverless/serverless-driver`
- Neon with Drizzle: `https://neon.com/docs/guides/drizzle`
- Drizzle ORM: `https://orm.drizzle.team/docs/overview`
- Better Auth Next.js: `https://better-auth.com/docs/integrations/next`
- Better Auth Drizzle adapter: `https://better-auth.com/docs/adapters/drizzle`
- Better Auth email/password: `https://better-auth.com/docs/authentication/email-password`
- Better Auth admin plugin: `https://better-auth.com/docs/plugins/admin`
- Better Auth security: `https://better-auth.com/docs/reference/security`
- Cloudflare R2 uploads: `https://developers.cloudflare.com/r2/objects/upload-objects/`
- Cloudflare R2 presigned URLs: `https://developers.cloudflare.com/r2/api/s3/presigned-urls/`
- Cloudflare R2 AWS SDK v3: `https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/`
- Cloudflare Turnstile server validation: `https://developers.cloudflare.com/turnstile/get-started/server-side-validation/`
- Resend: `https://resend.com/docs`
- React Email: `https://react.email/docs/introduction`
- TanStack Query: `https://tanstack.com/query/latest/docs/framework/react/overview`
- TanStack Table: `https://tanstack.com/table/latest/docs/introduction`
- Motion: `https://motion.dev/docs/react`
- Vercel: `https://vercel.com/docs`
- GBE official website and logo source: `https://gbeaward.com`

When official documentation conflicts with an old example, use the current official API while preserving this product behaviour.

## 49. Final Product Baseline

The production baseline is:

```text
Next.js App Router
React + strict TypeScript
Bun
Tailwind CSS
shadcn/ui + Base UI
Neon PostgreSQL
Drizzle ORM
Better Auth
Cloudflare R2 for all runtime-managed files
Cloudflare Turnstile
Resend + React Email
TanStack Table + TanStack Query + nuqs
Motion + Sonner
ExcelJS + CSV Stringify
Upstash rate limiting
Vercel deployment
Asia/Colombo business timezone
info@gbeaward.com support contact
No public sign-up
No applicant account before approval
No online card payment in Release 1
No Sentry
```

The public experience is one minimal, elegant nomination form. The approved-user experience is a refined applicant workspace. The staff experience is a fast, complete operational system with backend pagination, controlled editing, files, payment verification, communications, exports and auditability.

The quality bar is not merely that the workflows function. The final portal must feel deliberate in every state: balanced typography, restrained glass surfaces, smooth transitions, clear permissions, safe uploads, predictable navigation and no visibly unfinished interaction.

