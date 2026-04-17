import { sendUserOpenNotification } from "@/lib/whatsapp/api";
import {
  changeSessionStatus,
  getUsersToSendOpenNotification,
  markScheduledMessageAsSent,
  setAiRespondingStatus,
} from "@/lib/db/queries";
import { ScheduledMessageStatus, SessionStatus } from "@/lib/db/schema";
import { scheduleTomorrowMessage } from "@/lib/scheduler/api";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usersToSend = await getUsersToSendOpenNotification();

  const results = await Promise.allSettled(
    usersToSend.map(async ({ user, scheduledMessage }) => {
      const newSession = await sendUserOpenNotification(user);
      const oldSessionId = scheduledMessage.sessionHandled;
      try {
        scheduleTomorrowMessage(user, newSession);
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
