import "dotenv/config";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { E2E_R2_PREFIX } from "./database";

async function clearTestObjects() {
  if (
    !process.env.R2_ENDPOINT ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.R2_PRIVATE_BUCKET
  )
    return;
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_PRIVATE_BUCKET,
        Prefix: `${E2E_R2_PREFIX}/`,
        ContinuationToken: token,
      }),
    );
    const objects = (page.Contents ?? [])
      .filter((item): item is typeof item & { Key: string } => Boolean(item.Key))
      .map((item) => ({ Key: item.Key }));
    if (objects.length)
      await client.send(
        new DeleteObjectsCommand({
          Bucket: process.env.R2_PRIVATE_BUCKET,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
    token = page.NextContinuationToken;
  } while (token);
}

export default async function teardown() {
  await clearTestObjects();
}
