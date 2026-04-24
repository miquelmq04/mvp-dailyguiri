import { AIMessage } from "../claude/classes";
import {
  getContinueConversationSystemPrompt,
  getOpenNotificationSystemPrompt,
} from "../prompts";
import {
  ConversationMessageType,
  ConversationSession,
  MessageRole,
  SessionStatus,
  SessionType,
  SessionWithMessages,
  User,
} from "../db/schema";
import {
  createConversationSession,
  insertMessage,
  getLastOpeningQuestions,
  getConversationMessages,
  changeSessionStatus,
} from "../db/queries";
import { getAIProvider } from "../claude/provider";

export async function generateUserOpenNotification(
  user: User
): Promise<string> {
  const previousQuestions = await getLastOpeningQuestions(5, user);
  const systemPrompt = getOpenNotificationSystemPrompt(user, previousQuestions);
  const messagePrompt =
    "Generate an engaging question to start a conversation.";

  const provider = getAIProvider();
  const message = provider.generateResponse(systemPrompt, messagePrompt);
  return message;
}

export async function startConversation(
  user: User,
  message: string,
  maxUserMessages: number,
  messageType: ConversationMessageType,
  sessionStatus: SessionStatus = SessionStatus.IN_COURSE,
  sessionType: SessionType = SessionType.CONVERSATION
) {
  try {
    // Crear nueva sesión para la notificación abierta
    const session = await createConversationSession({
      userId: user.id,
      maxUserMessages: maxUserMessages,
      sessionStatus: sessionStatus,
      sessionType: sessionType,
    });

    // Insertar el mensaje del asistente (la notificación)
    await insertMessage({
      sessionId: session.id,
      userId: user.id,
      role: "assistant",
      content: message,
      messageType: messageType,
    });

    return session;
  } catch (error) {
    console.error("Error starting conversation:", error);
    throw new Error(
      `Failed to start conversation for user ${user.id}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export function calculateTomorrowMessageDate(user: User): Date {
  const from = user.notificationFrom || "10:00";
  const to = user.notificationTo || "20:00";

  const [fromHour, fromMin] = from.split(":").map(Number);
  const [toHour, toMin] = to.split(":").map(Number);

  const fromMinutes = fromHour * 60 + fromMin;
  const toMinutes = toHour * 60 + toMin;

  const randomMinutes =
    Math.floor(Math.random() * (toMinutes - fromMinutes)) + fromMinutes;

  const randomHour = Math.floor(randomMinutes / 60);
  const randomMin = randomMinutes % 60;

  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(randomHour, randomMin, 0, 0);

  return date;
}

export async function sendMessageToUser(lid: string, message: string) {
  try {
    const whatsappServiceUrl =
      process.env.WHATSAPP_SERVICE_URL ||
      "http://localhost:3001/api/send-message";
    const responseBaileys = await fetch(whatsappServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WHATSAPP_SECRET}`,
      },
      body: JSON.stringify({
        whatsappLid: lid,
        message: message,
      }),
    });

    const result = await responseBaileys.json();

    if (result.success) {
      return Response.json({
        message: "Mensaje enviado al usuario via Baileys",
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error("❌ Error al pedirle el envío a Baileys:", error);
    return Response.json(
      { error: "Error enviando respuesta" },
      { status: 500 }
    );
  }
}

export function getEndFreeTrialMessage(): string {
  return `
🌟 *¡Gracias por usar DailyGuiri!* 🌟

Has completado el período de prueba gratuito. ¿Te ha parecido útil la app para practicar tu inglés?

¿Estarías dispuesto/a a pagar entre 3-6€/mes para seguir mejorando tu inglés con funcionalidades premium como:

✨ *Topics personalizables*
🧠 *Preguntas más personales basadas en tu aprendizaje*
🎙️ *Audios para practicar speaking*
💬 *Más mensajes por día*
⏰ *Personalización de horarios de mensajes*
📝 *Quiz de preguntas*
🚀 *¡Y mucho más...!*

---

🌟 *Thank you for using DailyGuiri!* 🌟

You've completed the free trial period. Did you find the app useful for practicing your English?

Would you be willing to pay 3-6€/month to continue improving your English with premium features like:

✨ *Customizable topics*
🧠 *More personal questions based on your learning*
🎙️ *Audio messages to practice speaking*
💬 *More messages per day*
⏰ *Custom notification hours*
📝 *Question quizzes*
🚀 *And much more...*

Let us know what you think! 💭

---

📢 *El siguiente mensaje que me envíes será para recabar tu feedback. ¡Este mensaje para mí será ORO. Quiero honestidad completa!*

📢 *The next message you send will be to collect your feedback. This message will be GOLD for me. I want complete honesty!*

- Miquel`;
}

export async function respondUserWithContext(
  user: User,
  session: ConversationSession
) {
  const conversationMessages: AIMessage[] = await getConversationMessages(
    user,
    session
  );

  const conversationUserMessages = conversationMessages.filter(
    (msg) => msg.role === MessageRole.USER
  ).length;

  const provider = getAIProvider();
  const systemPrompt = getContinueConversationSystemPrompt(
    user,
    conversationUserMessages,
    session.maxUserMessages
  );
  const message = await provider.generateResponse(
    systemPrompt,
    conversationMessages
  );

  await insertMessage({
    sessionId: session.id,
    userId: user.id,
    role: MessageRole.ASSISTANT,
    content: message,
  });

  // Check if this was the last allowed user message and end session
  if (conversationUserMessages >= session.maxUserMessages) {
    await changeSessionStatus(session.id, SessionStatus.ENDED);
  }

  await sendMessageToUser(user.whatsappLid!, message);

  return message;
}
