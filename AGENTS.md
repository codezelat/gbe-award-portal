# GBE Awards Portal — Agent Guide

This file is the repository operating guide for coding agents and maintainers. It is intentionally specific: follow the code and commands in this repository over generic framework habits. User instructions and any nested `AGENTS.md` take precedence.

## 1. Start here

This is a production Next.js 16 application for the Global Business Excellence Awards 2026. It handles public nominations, private applicant access, staff operations, payment/document evidence and personal information.

Before changing anything:

1. Read the relevant page, route handler, server action and test—not only the component that appears on screen.
2. For any Next.js implementation, read the matching guide under `node_modules/next/dist/docs/` first. This project uses Next.js 16 and its App Router APIs may differ from earlier releases.
3. Inspect the current worktree with `git status --short --branch`; do not overwrite unrelated or user-owned edits.
4. Treat `README.md` as the product and operational reference, and keep it aligned if a user-facing, provider, route or command contract changes.

## 2. Repository map

| Path                                              | Responsibility                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`                                        | App Router pages, route handlers, layouts, metadata, loading and error boundaries. `apply` is public; `portal` is applicant-only; `admin` is staff-only. |
| `src/components/`                                 | Shared UI, form, upload, applicant and admin presentation components. Prefer existing primitives in `src/components/ui/`.                                |
| `src/server/`                                     | Server actions, data-access layer, business services, jobs and security controls. Keep privileged work here.                                             |
| `src/lib/`                                        | Environment parsing, database, Better Auth, R2 client, domain and export utilities.                                                                      |
| `src/config/`                                     | Award branding, navigation and role-permission definitions.                                                                                              |
| `src/emails/`                                     | React Email components and templates.                                                                                                                    |
| `drizzle/migrations/`                             | Append-only PostgreSQL migration history.                                                                                                                |
| `scripts/`                                        | Environment/provider verification, cycle seeding and one-time first-admin bootstrap.                                                                     |
| `tests/unit/`, `tests/integration/`, `tests/e2e/` | Unit, database-integrity and browser coverage.                                                                                                           |
| `public/brand/`                                   | Versioned public logo/artwork. Never store private applicant files here.                                                                                 |

## 3. Commands

Use **Bun 1.3.12**. Do not introduce npm, pnpm or another lockfile.

```bash
bun install
bun run dev
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run test:e2e
bun run build
bun run check
bun run env:verify
bun run providers:verify
```

Database commands:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
bun run db:seed
bun run db:bootstrap-admin
```

- `db:migrate` uses `DATABASE_URL_DIRECT`; it is for reviewed migrations.
- Never use `db:push` against staging or production.
- `test:integration` recreates a guarded `gbe_award_portal_test*` database.
- `test:e2e` recreates `gbe_award_portal_test_e2e` and uses the `e2e/playwright` R2 prefix. Never aim either suite at production.

## 4. Architecture and ownership boundaries

### Rendering and data access

- Default to Server Components in `src/app/`. Add `"use client"` only when browser state, effects or event handlers genuinely require it.
- Put authorization, data access, workflow transitions, signing and provider calls on the server. Do not move privileged logic into client components or expose server-only environment values.
- Use `src/server/dal/auth.ts` for private route guards. `requirePortalSession()` enforces an active applicant/staff profile; `requireStaff()` additionally enforces staff membership and TOTP MFA.
- `src/proxy.ts` is an early redirect guard, not the final authorization layer. Every sensitive action must still be verified server-side.
- Follow the existing import aliases (`@/…`) and strict TypeScript. Do not suppress errors with `any`, `@ts-ignore` or unsafe casts when a real type can be expressed.

### Domain rules

- Applications bulk actions use `src/server/actions/application-bulk-update.ts` and the shared options in `src/lib/domain/bulk-applications.ts`. Keep the 100-record bound, server-side target permissions, submitted/assignment scope, timestamp checks, stable lock order and atomic validation. The client request UUID is the batch audit primary key; retries must compare actor and payload fingerprint before returning an already-applied result. Preserve idempotent message outbox keys. Approval invitation failures are reported separately from committed status changes; never tell staff an approved batch was rolled back. Pending applicants with several nominations reuse one valid invitation without reactivating suspended/banned accounts. Corrections and applicant resubmission are not generic bulk transitions.

- Preserve `src/lib/domain/application-status.ts` and the transition service as the source of truth for nomination status changes. Do not update workflow state from arbitrary UI code.
- Internal access has two levels: `staff` for the complete nomination workflow and `super_admin` for people/system governance. Permission checks use `src/lib/domain/permissions.ts` and `src/config/permissions.ts`; do not rely on hidden navigation or client rendering as access control.
- Award-cycle data, fee settings, legal text, categories, programme copy and opening status are business-controlled content. Do not silently alter them during technical work. Ask for explicit direction when a change goes beyond the requested scope.
- References must remain opaque, non-sequential and unique. Do not replace their random six-digit suffix with a count or predictable ID.
- Normal nomination queries must exclude soft-deleted records. Reuse `src/server/dal/application-visibility.ts`: `nonDeletedApplications()` for ownership/linked views and `submittedApplications()` for submitted dashboards and summaries. Preserve explicit Deleted exports and audit history as separate scopes. Deletion/restoration must invalidate both admin and portal layouts so counts and linked views refresh together.
- A checkout recovery record is not a received nomination. `completedSubmission()` excludes unpaid card checkouts (including a switch to bank transfer before proof), while preserving settled and refunded history. `administrativeSubmissions()` also retains deleted checkout records for explicit archive/recovery views; apply the selected deletion filter separately. These pending records appear in In-progress as Awaiting payment. Do not erase payment attempts, references or evidence to hide them. Queue nomination notifications through `queueNominationReceived` on verified card settlement or accepted bank proof, using the existing unique outbox keys. Pending checkouts cannot use nomination workflow transitions.

### Files and exports

- File bytes belong in Cloudflare R2, never in PostgreSQL, `public/`, the repository or Vercel’s filesystem.
- Keep uploads private. Use the existing presign/complete routes, object-key prefixing, detected-type checks and signed download flow.
- Respect existing size, quantity, ownership, purpose and disposition checks. Do not trust browser MIME types or filenames.
- Use a dedicated R2 prefix for tests/previews. Do not reuse production objects or buckets for test data.
- Only a super admin may remove an incomplete nomination shell, and only when it has no final reference or retained evidence. The removal must clear staged private objects and mutable operational rows, soft-delete the shell, and preserve append-only audit records; it must refuse submitted or evidenced nominations.
- `/admin/in-progress` is available to staff with `applications.view_all`. Both staff and super admins with `applications.edit` may delete new nomination drafts; legacy upload-shell removal remains super-admin-only. Draft deletion must lock against submission, reject settled/submitted evidence, invalidate upload sessions, clear the draft payload and retain an audit tombstone. Removed draft files enter the existing retention queue.
- In-progress phone search normalizes punctuation and local leading zeros. Unpaid checkout links use `/admin/in-progress/[draftId]?source=card`, not the received-application interface. Staff with view-all and edit permissions can soft-delete unpaid checkouts through `removeUnpaidCheckout`; lock payment before application, protect submitted proof/settled evidence, and retain gateway attempts, references and files. A later verified settlement restores only the exact deletion marked by `checkoutRemovalAction` and its matching `deletedAt` audit timestamp. Never auto-restore unrelated administrative deletions. Checkout initiation, method switching and proof completion must recheck deletion under the payment lock. Bulk In-progress deletion is bounded to 100 unique records, independently transactional per record, and must report partial failures explicitly. Selection is current-page-only and resets on search/cycle/page changes. Revalidate admin and portal layouts after deletion.

### Authentication, email and jobs

- Better Auth is invitation-only (`disableSignUp: true`); public nomination does not create an account. Do not add a generic sign-up route.
- Login uses an adaptive Turnstile challenge after two failed attempts for the same HMAC-protected email/IP fingerprint in a 15-minute window. Verify the `gbe_login` action server-side before a further password check; do not add a client-only CAPTCHA or a second scheduler.
- Staff MFA is mandatory. Keep the existing QR/manual TOTP enrolment and challenge flows compatible with standard authenticator apps.
- Email is a durable outbox. Queue mail through the established flow; do not send ad-hoc messages directly from a page/action when delivery tracking and retry are required.
- Verify Resend webhook signatures before changing state.
- Genie card payments use the server-only client and `card-payments` service. Never trust a return URL or webhook state as proof of payment: verify the signature and fetch the transaction, matching App ID, local reference, amount and currency. Only `CONFIRMED` settles payment. Preserve the one-active-attempt lock, idempotent receipt allocation and ambiguous-timeout protection.
- Migration 0010 is additive; never backfill old payment amounts or methods. Enable Genie only after the migration and runtime permissions are verified. Keep card data on Genie's hosted page. UAT uses the isolated `scripts/dev-genie.mjs` helper, test credentials and `e2e/genie` storage prefix, never production nominations.
- The owner-confirmed LKR 10 card test is complete. `CARD_TEST_AMOUNT_MINOR` in `src/lib/domain/card-checkout-amount.ts` is `null`, so new checkouts use the saved nomination fee. Never re-enable test pricing without the owner's explicit request, reprice active attempts or rewrite settled test amounts.
- Nomination offers are managed under `/admin/cycles` with `configuration.manage`, an explicit Colombo-time editor, audit records and optimistic revision checks. Save through `src/server/services/nomination-offers.ts` into `system_settings` keys `nomination_offer:<cycle ID>`. No migration or cron is required. The base fee applies before the window; the offer fee applies during it; the regular fee applies after expiry or when disabled. The owner-approved fallback in `src/lib/domain/nomination-pricing.ts` remains 16 September 2026, 12:00 PM to 17 September 2026, 12:00 PM Asia/Colombo at LKR 65,000, then LKR 85,000, until replaced through the editor. Public display, step saves, initiation and final submission must load the saved configuration, not just the fallback constant. Final submission locks the cycle and checks the latest acknowledged amount, returning `409 PRICE_CHANGED` without losing files. Drafts only reserve a fee when a special invite has an active one-hour claim; otherwise they follow the general schedule. Preserve submitted payment snapshots and active attempts. Never restart the absolute window on deployment, silently ignore malformed settings, or rewrite the stored base fee or historical payments.
- Public form steps save through `/api/public/drafts`, using an opaque per-draft credential, first-save Turnstile, same-origin checks, request-size limits and rate limits. Save only on step navigation, not every keystroke. Drafts have no official reference, payment receipt, account or email notification. Migration 0011 is required before deployment. Final submission reuses verified draft files and marks the draft submitted in the same transaction as the official nomination.
- Vercel Hobby uses exactly one scheduled entry: `/api/cron/daily` in `vercel.json`. Add work to the daily dispatcher or event-driven processing; do not add duplicate cron schedules. Unsubmitted drafts and legacy upload shells remain in In-progress until explicit deletion. Upload-session expiry must not delete their records or verified draft attachments, and must never remove a submitted nomination's files.

### Special invites

- `/admin/special-invites` follows the selected cycle. Staff with `payments.view` can track claims; issuing, cancelling and downloading require `configuration.manage`. Batches contain 1 to 100 invites and use a stable request UUID for idempotency. Never log or audit plaintext codes.
- Apply additive migrations 0012 and 0013 and grant runtime `SELECT/INSERT` on `special_invite_batches` and `SELECT/INSERT/UPDATE` on `special_invites` before deployment. No new environment variable or cron is needed. Codes are AES-GCM encrypted using a domain-separated key derived from the existing `BETTER_AUTH_SECRET`; keep it stable or perform controlled re-encryption before rotation. Uniqueness is enforced on the code hash, including expired/cancelled codes.
- Claims go through `/api/public/special-invites`, with same-origin, body-size, durable IP/draft rate limits and an existing verified draft credential. Lock order is draft, cycle, invite. Only one invite per draft, no stacking or replacement. The discount must leave a positive payable amount.
- Claiming reserves the then-current discounted fee for exactly one hour. Retries never extend it. Submission consumes it atomically; expiry or draft deletion never releases it for reuse. Use `getDraftNominationPricing` for draft saves, restore, initiation and final completion. Keep the general offer schedule underneath so expiry can return to its current fee. Preserve submitted/active payment snapshots and require acknowledgement of changed prices.
- Invite barcode images decode locally in an on-demand client module. Generated JPG/ZIP downloads are private, bounded to 100 images, produced in memory and rechecked for unused status before response. Never persist barcode images in the database or expose claimed codes through public routes. Keep expiry time-derived, without polling or a scheduler.
- Preserve the route-scoped Sharp native-library includes in `next.config.ts`. `bun run build` also runs `build:verify-invite-download`, which generates a JPG from an isolated copy of the route's traced dependencies. A full local `node_modules` can hide a missing deployment binary, so development-server or unit-test success alone is insufficient for download changes.

### Guest tickets

- Public `/tickets` is login-free and separate from nominations. `/admin/tickets` lives in Operations. Staff with `payments.view` can inspect bookings; `payments.verify` is required for complimentary issuance, reconciliation, resend, cancellation and admission. `configuration.manage` controls sales settings and launch. Complimentary bookings must reference a submitted, non-deleted application from the same cycle and use its saved contact details.
- Apply additive migrations 0014 and 0015 and grant runtime `SELECT/INSERT/UPDATE` on `ticket_sales`, `ticket_bookings`, `ticket_payment_attempts`, and `guest_tickets` before deployment. Never alter historical nomination records. No new environment variables, cron schedules, Redis, public accounts or R2 objects are needed.
- All inventory mutations lock sale, then booking, then attempt/ticket. Capacity counts issued tickets and active reservations. Expiry can release only reservations without a gateway attempt; uncertain requests retain capacity. One stable request UUID identifies a booking, with a hashed opaque browser credential and payload fingerprint. One gateway attempt per booking prevents duplicate payment creation after uncertainty.
- Ticket details use a server-signed five-minute window tied to sale, quantity and acknowledged unit price. Creating a reservation starts a separate five-minute pre-checkout hold; creating the first Genie attempt sets a fixed 15-minute provider expiry. Retries must not reset either deadline. Browser countdowns use absolute timestamps, and payment expiry triggers one status check, not polling. An elapsed local timer must never independently cancel a potentially charged transaction or free its seats.
- Ticket checkout reuses the Genie server client but has a separate signed `/api/webhooks/genie-tickets` callback. Fetch and match the transaction before settlement. Preserve monotonic paid/refunded state, idempotent ticket allocation and outbox keys. A late confirmation without capacity becomes `review`; never oversell or silently discard received funds. Capacity increases plus reconciliation can fulfil it; real refunds happen in Genie and are then reconciled.
- Ticket PDFs are bounded to 20 guests, generated privately in memory and attached by the durable email outbox. Resend receives a stable private attachment URL (not freshly rendered bytes) so retries have the same payload despite nondeterministic PDF font subsetting. The download route accepts either the booking cookie or a separate domain-separated document HMAC; a document token cannot grant booking-page access. Never log either capability. Preserve the traced Noto Sans font for the two Vercel download routes. Booking/download responses are no-store/noindex. Render PDF code only in download routes, never in the public client or email worker.
- QR content is a random staff-only `/admin/tickets/check-in/[id]` link, with no guest contact details. GET is read-only; authorized POST/action confirms admission under locks. Duplicate scans, cancelled/refunded tickets and invalid credentials must fail safely. Cancellation of complimentary bookings must refuse any checked-in ticket and retain audit records. Paid records are never deleted to release seats.
- `/admin/tickets/scan` and both scanner actions require `requireStaff()` plus `payments.verify`. Decode camera frames and screenshots on-device using the lazy-loaded QR reader. Accept only this origin's exact ticket check-in URL, never navigate arbitrary decoded content. Stop camera tracks when leaving, hiding the page or opening a result. Allow camera only on this route via its scoped Permissions-Policy; entry links must use full document navigation to apply that header. Reuse `TicketGuestDetails` in scan results and direct check-in, with expandable long nominations and application details removed when permission is absent. Admission has a separate per-staff rate bucket for event-day throughput and always rechecks validity under locks.
- Application links belong to `ticket_bookings`, never individual guest tickets. Multiple bookings may reference one application. Staff may link/unlink public purchases only to submitted non-deleted applications in the sale's cycle, under the normal sale/booking lock order with expected-link concurrency checks and audit records. Do not change guest/payment snapshots or reissue tickets on linking. Complimentary source/application links are immutable.

## 5. Security and environment rules

- Never read, print, commit, paste into code, or include in screenshots any value from `.env`. Only `.env.example` belongs in Git.
- Keep `DATABASE_URL` (least-privilege runtime/pooler) and `DATABASE_URL_DIRECT` (migration owner) distinct. The direct owner URL must not be configured in the Vercel runtime.
- Maintain the security headers and CSP in `next.config.ts`. When adding a legitimate third-party browser origin, make the narrowest possible change and test the affected flow.
- Preserve Turnstile action and hostname verification, request rate limits and server-side validation. Production must not use Turnstile test keys.
- Do not log tokens, passwords, signed URLs, raw payment data, personal data or provider responses containing them.
- Treat all uploaded documents, emails and webhook payloads as untrusted input.

## 6. UI, accessibility and responsive behavior

- Reuse existing shared components and design tokens. Avoid new one-off design systems or heavy dependencies for a local change.
- Admin list pagination uses `TablePagination` or the server-side `OffsetPagination` wrapper. Show the visible record range, matching total and current/total pages; preserve filters, handle stale pages and prevent duplicate pending navigation. Keep cursor pagination for Applications. Use `AdminPageHeader` for standard admin section headings and hide desktop-only table structure for empty results.
- Keep the interface clear, minimal and touch-friendly. Test compact navigation, forms, tables, bulk actions and pagination on phone and tablet widths; desktop layouts must not force horizontal page overflow.
- Match each route’s loading boundary to its actual layout. Do not replace tailored skeletons with a generic unrelated placeholder.
- Preserve semantic labels, keyboard flow, visible focus, error summaries, skip link, sufficient touch targets and `aria-*` relationships. For public-flow changes, use the existing Axe/Playwright coverage as a baseline.
- Protected applicant/admin pages must retain `noindex`; public metadata and artwork belong in the root/public layouts only.

## 7. Database and migration discipline

- Edit `src/lib/db/schema.ts`, generate a migration with `bun run db:generate`, inspect the SQL and commit the schema and migration together.
- Do not edit an applied migration, migration snapshots or `_journal.json` to rewrite history.
- Prefer additive, backward-compatible migrations. Plan rollout and cleanup separately when a column or behavior must be removed.
- Before production schema work, require a Neon restore point or branch and a rollback plan. Apply reviewed migrations before code that depends on them.

## 8. Verification standard

Run the narrowest useful checks while iterating, then the full relevant gate before handoff:

| Change                                         | Minimum verification                                                                                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| UI/copy/layout                                 | `bun run lint`, `bun run typecheck`, targeted Playwright/Vitest test; inspect desktop and mobile rendering.                                   |
| Shared component/layout                        | `bun run check` and affected Playwright paths, including overflow and loading behavior.                                                       |
| Validation, permissions, workflow or API route | Unit coverage plus the affected integration/E2E scenario.                                                                                     |
| Database migration                             | Schema/migration review, `bun run db:migrate` on an isolated database, relevant integration tests.                                            |
| Provider, upload, auth, email or cron change   | `bun run env:verify`, `bun run providers:verify`, targeted E2E and real non-production provider verification.                                 |
| Release                                        | `bun run check`, relevant integration/E2E suite, `git diff --check`, clean intended worktree, Vercel Ready state and post-deploy smoke check. |

Do not claim a route, provider or deployment works merely because it compiles. State what was actually exercised and any external dependency still requiring the owner’s action.

## 9. Change and release hygiene

- Keep changes focused. Preserve unrelated work in a dirty tree and do not use destructive Git commands without explicit approval.
- Review `git diff --check` before committing. Commit only intended files with a concise, imperative message.
- Do not add GitHub Actions/workflows unless the user explicitly requests them.
- Do not push, alter Vercel configuration, change provider settings, run production migrations, send real email, open/close an award cycle or modify production data without explicit authorization.
- After a production push, wait for the Vercel deployment to be `Ready`, confirm the `access.gbeaward.com` alias, and smoke-test public endpoints. Authenticate protected production routes only with authorized access.

## 10. Documentation rule

When a route, command, provider contract, environment variable, safety control or operations workflow changes, update `README.md` and this file if the guidance is affected. Documentation must use actual paths and commands from the repository—never placeholders, invented services or unverified claims.
