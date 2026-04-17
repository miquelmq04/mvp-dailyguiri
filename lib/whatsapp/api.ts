import {
  generateUserOpenNotification,
  startConversation,
  sendMessageToUser,
} from "./messages";
import { setAiRespondingStatus } from "../db/queries";
import { User } from "../db/schema";

export async function sendUserOpenNotification(user: User) {
  const message = await generateUserOpenNotification(user);
  const session = await startConversation(user, message);
  await setAiRespondingStatus(session.id, true);

  if (!user.whatsappLid) throw Error();
  await sendMessageToUser(user.whatsappLid, message);

  return session;
}
