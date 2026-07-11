import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";

let sql: Sql;

beforeAll(() => {
  sql = postgres(process.env.TEST_DATABASE_URL!, { max: 2 });
});

afterAll(async () => {
  await sql.end();
});

describe("PostgreSQL migration and integrity contract", () => {
  it("installs all expected operational tables", async () => {
    const rows = await sql<
      { table_name: string }[]
    >`select table_name from information_schema.tables where table_schema = 'public'`;
    const names = new Set(rows.map((row) => row.table_name));
    for (const name of [
      "applications",
      "application_versions",
      "files",
      "payments",
      "email_outbox",
      "audit_logs",
      "job_runs",
    ])
      expect(names.has(name)).toBe(true);
  });

  it("rejects invalid award-cycle windows", async () => {
    await expect(
      sql`insert into award_cycles (name,slug,year,status,timezone,opens_at,closes_at,support_email,heading,intro_copy,declaration_text,declaration_version,terms_version,privacy_version,form_schema_version) values ('Bad','bad',2026,'draft','Asia/Colombo','2026-02-02','2026-02-01','info@gbeaward.com','Bad','Invalid test window','Approved declaration text long enough','1','1','1','1')`,
    ).rejects.toThrow(/award_cycles_valid_window/);
  });

  it("rejects impossible file metadata", async () => {
    await expect(
      sql`insert into files (bucket,object_key,purpose,status,size_bytes) values ('private','bad-size','other','pending',-1)`,
    ).rejects.toThrow(/files_size_nonnegative/);
    await expect(
      sql`insert into files (bucket,object_key,purpose,status,size_bytes,width,height) values ('private','bad-dimensions','other','pending',1,0,100)`,
    ).rejects.toThrow(/files_dimensions_positive/);
  });

  it("enforces email and upload idempotency keys", async () => {
    await sql`insert into email_outbox (template_key,recipient_email,payload,idempotency_key) values ('test','one@example.com','{}','same-email-key')`;
    await expect(
      sql`insert into email_outbox (template_key,recipient_email,payload,idempotency_key) values ('test','two@example.com','{}','same-email-key')`,
    ).rejects.toThrow(/unique/i);
  });

  it("cascades authentication sessions when a user is removed", async () => {
    await sql`insert into "user" (id,name,email,email_verified,created_at,updated_at) values ('user-1','User','user@example.com',true,now(),now())`;
    await sql`insert into session (id,expires_at,token,user_id,created_at,updated_at) values ('session-1',now()+interval '1 day','token-1','user-1',now(),now())`;
    await sql`delete from "user" where id='user-1'`;
    const [row] = await sql<
      { count: number }[]
    >`select count(*)::int as count from session where id='session-1'`;
    expect(row.count).toBe(0);
  });

  it("rolls back a failed multi-record transaction", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`insert into job_runs (job_key,status) values ('rollback-test','running')`;
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");
    const [row] = await sql<
      { count: number }[]
    >`select count(*)::int as count from job_runs where job_key='rollback-test'`;
    expect(row.count).toBe(0);
  });

  it("keeps audit records append-only at the database boundary", async () => {
    const [entry] = await sql<{ id: string }[]>`
      insert into audit_logs (actor_type,action,entity_type,metadata_redacted)
      values ('system','integration append-only check','test','{}')
      returning id
    `;
    await expect(
      sql`update audit_logs set action='tampered' where id=${entry.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(
      sql`delete from audit_logs where id=${entry.id}`,
    ).rejects.toThrow(/append-only/);
  });
});
