import "dotenv/config";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { sql } from "drizzle-orm";
import { Redis } from "@upstash/redis";
import { Resend } from "resend";
import { env, publicEnv, requireProvider } from "../src/lib/env";
import { getDb } from "../src/lib/db";
import { getR2 } from "../src/lib/r2/client";

for (const provider of ["database", "r2", "auth", "email"] as const)
  requireProvider(provider);
await getDb().execute(sql`select 1 as ok`);
const r2 = getR2();
await r2.send(
  new ListObjectsV2Command({ Bucket: env.R2_PRIVATE_BUCKET, MaxKeys: 1 }),
);
const verificationKey = `provider-verification/${crypto.randomUUID()}.txt`;
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
    Key: `provider-verification/${crypto.randomUUID()}.txt`,
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
if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  await new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  }).ping();
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
