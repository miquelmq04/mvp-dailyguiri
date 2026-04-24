import { UserPreferences } from "../whatsapp/types";
import { db } from "./drizzle";
import {
  users,
  conversationSessions,
  messages,
  User,
  ConversationSession,
  SessionWithMessages,
  NewConversationSession,
  NewMessage,
  scheduledMessages,
  NewScheduledMessage,
  MessageType,
  ScheduledMessageStatus,
  Message,
  MessageRole,
  SessionStatus,
  ConversationMessageType,
  NewUser,
} from "./schema";
import { desc, and, eq, isNull, gte, lte, asc, or } from "drizzle-orm";
import { AIMessage } from "../claude/classes";

export async function getUsersToSendOpenNotification() {
  return getUsersWithPendingScheduledMessages();
}

export async function getUserByNumber(number: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, number))
    .limit(1);

  return user || null;
}

export async function getUserByWhatsappLid(lid: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.whatsappLid, lid))
    .limit(1);

  return user || null;
}

export async function getUserActiveSession(
  user: User
): Promise<ConversationSession | null> {
  const [activeSession] = await db
    .select()
    .from(conversationSessions)
    .where(
      and(
        eq(conversationSessions.userId, user.id),
        eq(conversationSessions.sessionStatus, SessionStatus.IN_COURSE)
      )
    )
    .orderBy(desc(conversationSessions.startedAt))
    .limit(1);

  return activeSession || null;
}

export async function getSessionDetail(
  sessionId: number
): Promise<SessionWithMessages | null> {
  const session = await db.query.conversationSessions.findFirst({
    where: eq(conversationSessions.id, sessionId),
    with: {
      messages: true,
    },
  });

  if (!session) return null;

  return session as SessionWithMessages;
}

export async function createConversationSession(
  newSession: NewConversationSession
): Promise<ConversationSession> {
  const [session] = await db
    .insert(conversationSessions)
    .values(newSession)
    .returning();
  return session;
}

export async function insertMessage(newMessage: NewMessage) {
  await db.insert(messages).values(newMessage);

  await db
    .update(conversationSessions)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversationSessions.id, newMessage.sessionId));
}

export async function createScheduledMessage(
  scheduledMessage: NewScheduledMessage
) {
  await db.insert(scheduledMessages).values(scheduledMessage);
}

export async function getUsersWithPendingScheduledMessages() {
  const now = new Date();

  const pending = await db
    .select({
      user: users,
      scheduledMessage: scheduledMessages,
    })
    .from(scheduledMessages)
    .innerJoin(users, eq(scheduledMessages.userId, users.id))
    .where(
      and(
        eq(scheduledMessages.status, ScheduledMessageStatus.PENDING),
        or(
          eq(scheduledMessages.messageType, MessageType.OPEN_NOTIFICATION),
          eq(scheduledMessages.messageType, MessageType.FREE_TRIAL_ENDED)
        ),
        lte(scheduledMessages.scheduledDate, now)
      )
    );

  return pending;
}

export async function markScheduledMessageAsSent(
  scheduledMessageId: number,
  error?: string
) {
  await db
    .update(scheduledMessages)
    .set({
      status: error
        ? ScheduledMessageStatus.FAILED
        : ScheduledMessageStatus.SENT,
      sentAt: new Date(),
      errorMessage: error || null,
    })
    .where(eq(scheduledMessages.id, scheduledMessageId));
}

export async function getConversationMessages(
  user: User,
  session: ConversationSession
): Promise<AIMessage[]> {
  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, session.id))
    .orderBy(asc(messages.createdAt));

  return conversationMessages.map((msg) => ({
    role: msg.role as MessageRole.USER | MessageRole.ASSISTANT,
    content: msg.content,
  }));
}

export async function setAiRespondingStatus(
  sessionId: number,
  isResponding: boolean
) {
  await db
    .update(conversationSessions)
    .set({ isAiResponding: isResponding })
    .where(eq(conversationSessions.id, sessionId));
}

export async function changeSessionStatus(
  sessionId: number,
  status: SessionStatus
) {
  await db
    .update(conversationSessions)
    .set({ sessionStatus: status })
    .where(eq(conversationSessions.id, sessionId));
}

export async function getLastOpeningQuestions(quantity: number, user: User) {
  const conversationMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.userId, user.id),
        eq(messages.messageType, ConversationMessageType.OPEN),
        eq(messages.role, MessageRole.ASSISTANT)
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(quantity);

  return conversationMessages.map((msg) => msg.content);
}

export async function createUser(user: NewUser) {
  await db.insert(users).values(user);
}

export async function setUserName(user: User, newUserName: string) {
  await db
    .update(users)
    .set({ name: newUserName })
    .where(eq(users.id, user.id));
}

export async function getNotificationsSent(
  user: User,
  messageType: ConversationMessageType
): Promise<number> {
  const result = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.userId, user.id),
        eq(messages.messageType, messageType),
        eq(messages.role, MessageRole.ASSISTANT)
      )
    );

  return result.length;
}
