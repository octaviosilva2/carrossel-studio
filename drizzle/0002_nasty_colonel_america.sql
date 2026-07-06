ALTER TABLE "clients" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'client' NOT NULL;