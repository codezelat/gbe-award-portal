import "dotenv/config";
import { execFileSync } from "node:child_process";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import {
  E2E_DATABASE_NAME,
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  E2E_APPLICATION_REFERENCE,
  E2E_R2_PREFIX,
  databaseUrlFor,
  e2eDatabaseUrl,
  e2eRuntimeDatabaseUrl,
} from "./database";

function createFixturePdf() {
  const stream = "BT /F1 18 Tf 72 720 Td (GBE secure preview test) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1))
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

async function uploadFixturePdf(body: Buffer) {
  if (
    !process.env.R2_ENDPOINT ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.R2_PRIVATE_BUCKET
  )
    throw new Error("R2 is required for the protected-preview E2E fixture.");
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_PRIVATE_BUCKET,
      Key: `${E2E_R2_PREFIX}/fixture-payment-proof.pdf`,
      Body: body,
      ContentType: "application/pdf",
    }),
  );
}

export default async function setup() {
  const fixturePdf = createFixturePdf();
  await uploadFixturePdf(fixturePdf);
  const admin = postgres(databaseUrlFor("neondb"), { max: 1 });
  await admin.unsafe(
    `DROP DATABASE IF EXISTS "${E2E_DATABASE_NAME}" WITH (FORCE)`,
  );
  await admin.unsafe(`CREATE DATABASE "${E2E_DATABASE_NAME}"`);
  await admin.end();

  const testUrl = e2eDatabaseUrl();
  const client = postgres(testUrl, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle/migrations" });
  await client.end();

  execFileSync("bun", ["--conditions=react-server", "scripts/seed.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: testUrl,
      DATABASE_URL_DIRECT: testUrl,
      SEED_CYCLE_OPENS_AT: "2026-01-01T00:00:00.000Z",
      SEED_CYCLE_CLOSES_AT: "2026-12-31T23:59:59.999Z",
    },
    stdio: "inherit",
  });

  const seeded = postgres(testUrl, { max: 1 });
  await seeded`
    update award_cycles
    set status = 'open', updated_at = now()
    where slug = 'gbe-awards-2026'
  `;
  await seeded`
    with fixture as (
      select
        c.id as cycle_id,
        c.declaration_text,
        c.declaration_version,
        c.terms_version,
        c.privacy_version,
        c.form_schema_version,
        cat.id as category_id,
        cat.name as category_name,
        cat.code as category_code
      from award_cycles c
      join award_categories cat on cat.cycle_id = c.id
      where c.slug = 'gbe-awards-2026'
      order by cat.display_order
      limit 1
    )
    insert into applications (
      reference, cycle_id, category_id, workflow_status, payment_status,
      account_access_status, nominee_name, award_nomination, email_normalised,
      business_website, email_display, phone_e164, phone_display, category_name_snapshot,
      category_code_snapshot, declaration_accepted, declaration_text_snapshot,
      declaration_version, terms_version, privacy_version, form_schema_version,
      submitted_at, last_activity_at
    )
    select
      ${E2E_APPLICATION_REFERENCE}, cycle_id, category_id, 'submitted',
      'proof_submitted', 'not_created', 'Playwright Fixture Organisation',
      'Recognising the fixture organisation for test excellence.', 'fixture@example.test', 'https://gbeaward.com/',
      'fixture@example.test', '+94771234567', '+94 77 123 4567', category_name, category_code, true,
      declaration_text, declaration_version, terms_version, privacy_version,
      form_schema_version, now(), now()
    from fixture
  `;
  await seeded`
    with fixture as (
      select id from applications where reference = ${E2E_APPLICATION_REFERENCE}
    ), proof as (
      insert into files (
        bucket, object_key, purpose, status, original_filename,
        safe_download_filename, extension, mime_type_claimed,
        mime_type_detected, size_bytes, validated_at
      )
      values (
        'private', 'e2e/playwright/fixture-payment-proof.pdf',
        'payment_proof', 'ready', 'fixture-payment-proof.pdf',
        'fixture-payment-proof.pdf', 'pdf', 'application/pdf',
        'application/pdf', ${fixturePdf.byteLength}, now()
      )
      returning id
    ), linked_proof as (
      insert into application_files (application_id, file_id, kind)
      select fixture.id, proof.id, 'payment_proof' from fixture, proof
      returning id, application_id
    )
    insert into payments (
      application_id, status, currency, amount_minor, proof_application_file_id,
      payer_name, bank_reference, payment_reference, paid_at
    )
    select
      application_id, 'proof_submitted', 'LKR', null, id,
      'Playwright Fixture Payer', 'E2E-BANK-REFERENCE', 'PAY-E2E-2026', null
    from linked_proof
  `;
  const runtimeRole = new URL(e2eRuntimeDatabaseUrl()).username;
  if (!/^[a-z_][a-z0-9_]*$/i.test(runtimeRole))
    throw new Error("The Playwright runtime database role is invalid.");
  await seeded.unsafe(
    `GRANT CONNECT ON DATABASE "${E2E_DATABASE_NAME}" TO "${runtimeRole}"`,
  );
  await seeded.unsafe(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
  await seeded.unsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${runtimeRole}"`,
  );
  await seeded.unsafe(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${runtimeRole}"`,
  );
  await seeded.end();

  execFileSync(
    "bun",
    ["--conditions=react-server", "scripts/bootstrap-admin.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: testUrl,
        DATABASE_URL_DIRECT: testUrl,
        BETTER_AUTH_URL: "http://localhost:3100",
        RESEND_API_KEY: "",
        BOOTSTRAP_ADMIN_NAME: "Playwright Administrator",
        BOOTSTRAP_ADMIN_EMAIL: E2E_ADMIN_EMAIL,
        BOOTSTRAP_ADMIN_PASSWORD: E2E_ADMIN_PASSWORD,
      },
      stdio: "inherit",
    },
  );
}
