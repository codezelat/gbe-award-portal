import "dotenv/config";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sql } from "drizzle-orm";
import { Resend } from "resend";
import { env, publicEnv, requireProvider } from "../src/lib/env";
import { getDb } from "../src/lib/db";
import { getR2, r2ObjectKey } from "../src/lib/r2/client";

for (const provider of ["database", "r2", "auth", "email"] as const)
  requireProvider(provider);
await getDb().execute(sql`select 1 as ok`);
if (env.GENIE_ENABLED === "true") {
  const result = await getDb().execute(sql`select
    has_table_privilege(current_user, 'public.payment_attempts', 'SELECT')
    and has_table_privilege(current_user, 'public.payment_attempts', 'INSERT')
    and has_table_privilege(current_user, 'public.payment_attempts', 'UPDATE') as "canUse"`);
  if (result.rows[0]?.canUse !== true)
    throw new Error(
      "Apply migration 0010 and grant the runtime role SELECT, INSERT and UPDATE on payment_attempts before enabling Genie.",
    );
  const host =
    env.GENIE_ENVIRONMENT === "sandbox"
      ? "https://api.uat.geniebiz.lk"
      : "https://api.geniebiz.lk";
  const response = await fetch(
    `${host}/public/transactions/000000000000000000000000`,
    {
      headers: { Authorization: env.GENIE_API_KEY ?? "" },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    },
  );
  if (response.status !== 404)
    throw new Error(
      "Genie authentication check failed. Confirm the API key and environment.",
    );
  console.log(
    "Genie API authentication and runtime table permissions verified (no transaction created).",
  );
}
const rateLimitTable = await getDb().execute(sql<{
  tableName: string | null;
  canUse: boolean;
}>`
  select
    to_regclass('public.rate_limit_buckets')::text as "tableName",
    has_table_privilege(
      current_user,
      'public.rate_limit_buckets',
      'SELECT,INSERT,UPDATE'
    ) as "canUse"
`);
if (
  rateLimitTable.rows[0]?.tableName !== "rate_limit_buckets" ||
  rateLimitTable.rows[0]?.canUse !== true
)
  throw new Error(
    "The runtime database role cannot use the durable rate-limit table.",
  );
const r2 = getR2();
await r2.send(
  new ListObjectsV2Command({ Bucket: env.R2_PRIVATE_BUCKET, MaxKeys: 1 }),
);
const verificationKey = r2ObjectKey(
  `provider-verification/${crypto.randomUUID()}.txt`,
);
await r2.send(
  new PutObjectCommand({
    Bucket: env.R2_PRIVATE_BUCKET,
    Key: verificationKey,
    Body: "GBE provider verification",
    ContentType: "text/plain",
  }),
);
await r2.send(
  new DeleteObjectCommand({
    Bucket: env.R2_PRIVATE_BUCKET,
    Key: verificationKey,
  }),
);
const origin = new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin;
const presignedUpload = await getSignedUrl(
  r2,
  new PutObjectCommand({
    Bucket: env.R2_PRIVATE_BUCKET,
    Key: r2ObjectKey(`provider-verification/${crypto.randomUUID()}.txt`),
    ContentType: "text/plain",
  }),
  { expiresIn: 60 },
);
const preflight = await fetch(presignedUpload, {
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "PUT",
    "Access-Control-Request-Headers": "content-type",
  },
});
if (
  !preflight.ok ||
  preflight.headers.get("access-control-allow-origin") !== origin
)
  throw new Error(
    `R2 private-bucket CORS does not allow secure PUT uploads from ${origin}.`,
  );
const domains = await new Resend(env.RESEND_API_KEY).domains.list();
const senderDomain = env.EMAIL_FROM.match(/@([^>]+)>?$/)?.[1];
if (domains.error) {
  if (!domains.error.message.includes("restricted to only send emails"))
    throw new Error(domains.error.message);
} else if (
  !senderDomain ||
  !domains.data?.data.some(
    (domain) => domain.status === "verified" && domain.name === senderDomain,
  )
)
  throw new Error(
    `Resend sending domain ${senderDomain ?? "unknown"} is not verified.`,
  );
if (
  env.APP_ENV === "production" &&
  env.TURNSTILE_EXPECTED_HOSTNAME.split(",")
    .map((value) => value.trim())
    .some((host) => host === "localhost")
)
  throw new Error("Production Turnstile hostnames must not include localhost.");
console.log(
  `Database, Better Auth configuration, private R2 bucket/CORS, Resend domain, durable rate limiting and Turnstile hostname policy verified for ${env.APP_ENV}.`,
);
