import {
  generateUserOpenNotification,
  startConversation,
  sendMessageToUser,
} from "./messages";
import { setAiRespondingStatus } from "../db/queries";
import { ConversationMessageType, User } from "../db/schema";

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
