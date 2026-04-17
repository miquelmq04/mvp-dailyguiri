ALTER TABLE "scheduled_messages" RENAME COLUMN "created_session_id" TO "session_handled";--> statement-breakpoint
ALTER TABLE "scheduled_messages" DROP CONSTRAINT "scheduled_messages_created_session_id_conversation_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_session_handled_conversation_sessions_id_fk" FOREIGN KEY ("session_handled") REFERENCES "public"."conversation_sessions"("id") ON DELETE no action ON UPDATE no action;