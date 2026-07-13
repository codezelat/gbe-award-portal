ALTER TABLE "applications" ADD COLUMN "award_nomination" text;--> statement-breakpoint
UPDATE "applications"
SET "award_nomination" = COALESCE(NULLIF("industry_sector", ''), 'Not provided')
WHERE "award_nomination" IS NULL;--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "award_nomination" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "industry_sector" DROP NOT NULL;
