import { callClaudeAPI, ClaudeMessage } from "@/lib/claude/api";
import {
  getUserByNumber,
  getUserActiveSession,
  getSessionDetail,
  insertMessage,
  getConversationMessages,
  setAiRespondingStatus,
  changeSessionStatus,
  getUserByWhatsappLid,
  createUser,
  setUserName,
} from "@/lib/db/queries";
import { MessageRole, SessionStatus } from "@/lib/db/schema";
import { getContinueConversationSystemPrompt } from "@/lib/prompts";
import { scheduleMessage, scheduleTomorrowMessage } from "@/lib/scheduler/api";
import { sendMessageToUser } from "@/lib/whatsapp/messages";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.WHATSAPP_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await request.json();
  if (!data.whatsappLid || !data.message) {
    return Response.json(
      { error: "Invalid data format: Whatsapp lid and message are required" },
      { status: 400 }
    );
  }
  const userMessage = data.message;

  // TODO: IMPLEMENTAR SISTEMA DE SUSCRIPCIO PER LA MVP (Enviar un pass) + PROGRAMACIO 1r SCHEDULED_MSG
  if (userMessage === "5692312391@sub") {
    await createUser({
      whatsappLid: data.whatsappLid,
    });
    const message =
      "Perfecte! Ja estàs registrat 😊 Com vols que em dirigeixi a tu? (el teu nom o sobrenom)";
    await sendMessageToUser(data.whatsappLid, message);
    return Response.json({
      whatsappLid: data.whatsappLid,
      message: message,
    });
  }

  const user = await getUserByWhatsappLid(data.whatsappLid);
  if (!user) {
    return Response.json(
      { error: "No user found with that whatsapp lid" },
      { status: 404 }
    );
  }

  if (!user.name) {
    await setUserName(user, userMessage);
    const message = `Perfect ${userMessage}! 😊 You're all set. I've scheduled your daily English practice messages. The first one is coming soon!`;
    await sendMessageToUser(data.whatsappLid, message);
    await scheduleMessage(new Date(2004), user, null);

    // Trigger cron to send the scheduled message after 7 seconds
    setTimeout(async () => {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      await fetch(`${baseUrl}/api/cron/send-users-open-notification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      });
    }, 7000);

    return Response.json({
      whatsappLid: data.whatsappLid,
      message: message,
    });
  }

  const activeSession = await getUserActiveSession(user);
  if (!activeSession) {
    return Response.json(
      { error: "User doesn't have an active session" },
      { status: 404 }
    );
  }

  if (activeSession.isAiResponding) {
    return Response.json(
      { error: "AI is currently generating a response, please wait a moment" },
      { status: 429 }
    );
  }

  try {
    // Mark session as AI responding
    await setAiRespondingStatus(activeSession.id, true);

    const sessionDetail = await getSessionDetail(activeSession.id);
    if (!sessionDetail) {
      return Response.json(
        { error: "Error fetching the session" },
        { status: 500 }
      );
    }

    await insertMessage({
      sessionId: sessionDetail.id,
      userId: user.id,
      role: MessageRole.USER,
      content: userMessage,
    });

    const conversationMessages: ClaudeMessage[] = await getConversationMessages(
      user,
      sessionDetail
    );

    const conversationUserMessages = conversationMessages.filter(
      (msg) => msg.role === MessageRole.USER
    ).length;

    const claudeResponse = await callClaudeAPI(
      getContinueConversationSystemPrompt(
        user,
        conversationUserMessages,
        sessionDetail.maxUserMessages
      ),
      conversationMessages
    );

    const messageToUser = claudeResponse.content[0];
    if (messageToUser.type !== "text") {
      console.error("Claude response is not text type:", messageToUser.type);
      return Response.json(
        { error: "Invalid response format from AI" },
        { status: 500 }
      );
    }

    await insertMessage({
      sessionId: sessionDetail.id,
      userId: user.id,
      role: MessageRole.ASSISTANT,
      content: messageToUser.text,
    });

    // Check if this was the last allowed user message and end session
    if (conversationUserMessages >= activeSession.maxUserMessages) {
      await changeSessionStatus(activeSession.id, SessionStatus.ENDED);
    }

    await sendMessageToUser(user.whatsappLid!, messageToUser.text);

    return Response.json({
      whatsappLid: user.whatsappLid,
      message: messageToUser.text,
    });
  } finally {
    // Always reset AI responding status
    await setAiRespondingStatus(activeSession.id, false);
  }
}
