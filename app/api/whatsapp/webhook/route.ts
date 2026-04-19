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
import {
  ConversationMessageType,
  MessageRole,
  MessageType,
  SessionStatus,
  SessionType,
} from "@/lib/db/schema";
import { getContinueConversationSystemPrompt } from "@/lib/prompts";
import { scheduleMessage, scheduleTomorrowMessage } from "@/lib/scheduler/api";
import {
  respondUserWithContext,
  sendMessageToUser,
} from "@/lib/whatsapp/messages";

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

  if (userMessage === "5692312391@sub") {
    await createUser({
      whatsappLid: data.whatsappLid,
    });
    const message =
      "¡Perfecto! Ya estás registrado 😊 ¿Cómo quieres que me dirija a ti? (tu nombre o apodo)";
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

    const messageType =
      activeSession.sessionType === SessionType.FREE_TRIAL_ENDED
        ? ConversationMessageType.FEEDBACK
        : ConversationMessageType.CONVERSATION;

    await insertMessage({
      sessionId: activeSession.id,
      userId: user.id,
      role: MessageRole.USER,
      content: userMessage,
      messageType: messageType,
    });
    let messageSended = null;
    if (activeSession.sessionType === SessionType.FREE_TRIAL_ENDED) {
      messageSended =
        "Thank you for sending feedback! See you in the next version!";
      await sendMessageToUser(user.whatsappLid!, messageSended);
      await changeSessionStatus(activeSession.id, SessionStatus.ENDED);
    } else messageSended = await respondUserWithContext(user, activeSession);

    return Response.json({
      whatsappLid: user.whatsappLid,
      message: messageSended,
    });
  } finally {
    // Always reset AI responding status
    await setAiRespondingStatus(activeSession.id, false);
  }
}
