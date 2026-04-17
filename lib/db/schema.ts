// lib/db/schema.ts
import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  varchar,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============ TABLES ============

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").unique(),
  whatsappLid: text("whatsapp_lid").notNull().unique(),
  name: text("name"),
  topics: jsonb("topics").$type<string[]>().default([]),
  notificationFrom: text("notification_from").default("10:00"),
  notificationTo: text("notification_to").default("20:00"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversationSessions = pgTable("conversation_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  isAiResponding: boolean("is_ai_responding").notNull().default(false),
  sessionStatus: varchar("session_status", { length: 20 })
    .notNull()
    .default("in_course"), // 'in_course' | 'ended'
  maxUserMessages: integer("max_user_messages").notNull().default(5), // Maximum user messages allowed
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => conversationSessions.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant' | 'system'
  messageType: varchar("message_type", { length: 20 })
    .notNull()
    .default("conversation"), // 'open' | 'conversation' | 'closing'
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<{
    tokens?: number;
    model?: string;
    promptVersion?: string;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  scheduledDate: timestamp("scheduled_date").notNull(),
  messageType: varchar("message_type", { length: 50 }).notNull(), // 'open_notification', 'reminder', etc.
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'sent', 'failed', 'cancelled'
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  sessionHandled: integer("session_handled").references(
    () => conversationSessions.id
  ),
});

// ============ RELATIONS ============

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(conversationSessions),
  messages: many(messages),
  scheduledMessages: many(scheduledMessages),
}));

export const conversationSessionsRelations = relations(
  conversationSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [conversationSessions.userId],
      references: [users.id],
    }),
    messages: many(messages),
  })
);

export const messagesRelations = relations(messages, ({ one }) => ({
  session: one(conversationSessions, {
    fields: [messages.sessionId],
    references: [conversationSessions.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const scheduledMessagesRelations = relations(
  scheduledMessages,
  ({ one }) => ({
    user: one(users, {
      fields: [scheduledMessages.userId],
      references: [users.id],
    }),
  })
);

// ============ TYPES ============

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type ConversationSession = typeof conversationSessions.$inferSelect;
export type NewConversationSession = typeof conversationSessions.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type NewScheduledMessage = typeof scheduledMessages.$inferInsert;

// Tipos compuestos útiles
export type SessionWithMessages = ConversationSession & {
  messages: Message[];
};

export type UserWithSessions = User & {
  sessions: ConversationSession[];
};

export type MessageWithUser = Message & {
  user: Pick<User, "id" | "name" | "phoneNumber">;
};

// ============ ENUMS ============

export enum MessageRole {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
}

export enum ConversationMessageType {
  OPEN = "open",
  CONVERSATION = "conversation",
  CLOSING = "closing",
}

export enum MessageType {
  OPEN_NOTIFICATION = "open_notification",
  REMINDER = "reminder",
  FOLLOW_UP = "follow_up",
}

export enum ScheduledMessageStatus {
  PENDING = "pending",
  SENT = "sent",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum SessionStatus {
  IN_COURSE = "in_course",
  ENDED = "ended",
  CLOSED = "closed",
}
