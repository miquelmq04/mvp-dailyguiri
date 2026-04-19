import { createScheduledMessage } from "../db/queries";
import {
  ConversationSession,
  MessageType,
  ScheduledMessageStatus,
  User,
} from "../db/schema";
import { calculateTomorrowMessageDate } from "../whatsapp/messages";

export async function scheduleTomorrowMessage(
  user: User,
  newSession: ConversationSession,
  messageType: MessageType
) {
  // Schedule tomorrow's message
  const tomorrowRandomDate = calculateTomorrowMessageDate(user);
  await createScheduledMessage({
    userId: user.id,
    scheduledDate: tomorrowRandomDate,
    messageType: messageType,
    status: ScheduledMessageStatus.PENDING,
    sessionHandled: newSession.id,
  });
}

export async function scheduleMessage(
  date: Date,
  user: User,
  newSession: ConversationSession | null
) {
  await createScheduledMessage({
    userId: user.id,
    scheduledDate: date,
    messageType: MessageType.OPEN_NOTIFICATION,
    status: ScheduledMessageStatus.PENDING,
    sessionHandled: newSession?.id ?? null,
  });
}
