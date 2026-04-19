import {
  generateUserOpenNotification,
  startConversation,
  sendMessageToUser,
  getEndFreeTrialMessage,
} from "./messages";
import { setAiRespondingStatus } from "../db/queries";
import {
  ConversationMessageType,
  SessionStatus,
  SessionType,
  User,
} from "../db/schema";

export async function sendUserOpenNotification(user: User) {
  const message = await generateUserOpenNotification(user);
  const session = await startConversation(
    user,
    message,
    Number(process.env.TOTAL_USER_SESSION_MESSAGES),
    ConversationMessageType.OPEN
  );
  await setAiRespondingStatus(session.id, true);

  if (!user.whatsappLid) throw Error();
  await sendMessageToUser(user.whatsappLid, message);

  return session;
}

export async function sendFreeTrialEndNotification(user: User) {
  const message = await getEndFreeTrialMessage();
  const session = await startConversation(
    user,
    message,
    1,
    ConversationMessageType.CONVERSATION,
    SessionStatus.IN_COURSE,
    SessionType.FREE_TRIAL_ENDED
  );
  await setAiRespondingStatus(session.id, true);

  if (!user.whatsappLid) throw Error();
  await sendMessageToUser(user.whatsappLid, message);

  return session;
}
