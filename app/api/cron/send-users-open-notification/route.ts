import {
  sendFreeTrialEndNotification,
  sendUserOpenNotification,
} from "@/lib/whatsapp/api";
import {
  changeSessionStatus,
  getNotificationsSent,
  getUsersToSendOpenNotification,
  markScheduledMessageAsSent,
  setAiRespondingStatus,
} from "@/lib/db/queries";
import {
  ConversationMessageType,
  MessageType,
  ScheduledMessageStatus,
  SessionStatus,
} from "@/lib/db/schema";
import { scheduleTomorrowMessage } from "@/lib/scheduler/api";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usersToSend = await getUsersToSendOpenNotification();

  /* TODO: Si tu cron se despierta cada 5 minutos y encuentra 50 mensajes pendientes,
   tu código debe ser capaz de "encolarlos" con un pequeño retraso aleatorio entre ellos
  (ej. entre 2 y 5 segundos).
  */

  const results = await Promise.allSettled(
    usersToSend.map(async ({ user, scheduledMessage }) => {
      let newSession = null;

      let messageType = scheduledMessage.messageType;
      if (messageType === MessageType.OPEN_NOTIFICATION)
        newSession = await sendUserOpenNotification(user);
      else if (messageType === MessageType.FREE_TRIAL_ENDED)
        newSession = await sendFreeTrialEndNotification(user); //TODO: Change the logic to handle FREE_TRIAL_END
      else throw Error("Message type can't be handled");
      const oldSessionId = scheduledMessage.sessionHandled;
      try {
        let nextMessageType = MessageType.OPEN_NOTIFICATION;
        const notificationType = ConversationMessageType.OPEN;
        if ((await getNotificationsSent(user, notificationType)) >= 7) {
          // TODO: Free trial exceed
          nextMessageType = MessageType.FREE_TRIAL_ENDED;
        } else await scheduleTomorrowMessage(user, newSession, nextMessageType);

        await markScheduledMessageAsSent(scheduledMessage.id);
        if (
          oldSessionId !== null &&
          scheduledMessage.status === ScheduledMessageStatus.PENDING
        ) {
          await changeSessionStatus(oldSessionId, SessionStatus.CLOSED);
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        await markScheduledMessageAsSent(scheduledMessage.id, errorMsg);
        throw error;
      } finally {
        await setAiRespondingStatus(newSession.id, false);
      }
    })
  );

  const successful = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return Response.json(
    {
      success: true,
      messagesSent: successful,
      failed,
      total: usersToSend.length,
    },
    { status: 200 }
  );
}
