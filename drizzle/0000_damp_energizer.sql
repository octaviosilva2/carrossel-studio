CREATE TABLE "carousels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"override_name" text,
	"override_handle" text,
	"override_avatar_url" text,
	"override_verified" boolean,
	"override_theme" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"handle" text NOT NULL,
	"avatar_url" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"theme" text DEFAULT 'light' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"carousel_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"image_url" text,
	CONSTRAINT "slides_carousel_position_unq" UNIQUE("carousel_id","position")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "carousels" ADD CONSTRAINT "carousels_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carousels" ADD CONSTRAINT "carousels_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_carousel_id_carousels_id_fk" FOREIGN KEY ("carousel_id") REFERENCES "public"."carousels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carousels_owner_id_idx" ON "carousels" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "carousels_client_id_idx" ON "carousels" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_owner_id_idx" ON "clients" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "slides_carousel_id_idx" ON "slides" USING btree ("carousel_id");