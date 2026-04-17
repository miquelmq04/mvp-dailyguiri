ALTER TABLE "users" ADD COLUMN "whatsapp_lid" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_whatsapp_lid_unique" UNIQUE("whatsapp_lid");