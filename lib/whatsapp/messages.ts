import { callClaudeAPI } from "../claude/api";
import { UserPreferences } from "./types";
import { getOpenNotificationSystemPrompt } from "../prompts";
import { ConversationMessageType, User } from "../db/schema";
import {
  createConversationSession,
  insertMessage,
  getLastOpeningQuestions,
} from "../db/queries";

export async function generateUserOpenNotification(
  user: User
): Promise<string> {
  const previousQuestions = await getLastOpeningQuestions(5, user);
  const systemPrompt = getOpenNotificationSystemPrompt(user, previousQuestions);
  const messagePrompt =
    "Generate an engaging question to start a conversation.";
  const message = await callClaudeAPI(systemPrompt, messagePrompt);

  const firstBlock = message.content[0];
  if (firstBlock.type === "text") {
    return firstBlock.text;
  }

  throw new Error("Expected text content from Claude");
}

export async function startConversation(user: User, message: string) {
  try {
    // Crear nueva sesión para la notificación abierta
    const session = await createConversationSession({
      userId: user.id,
      maxUserMessages: Number(process.env.TOTAL_USER_SESSION_MESSAGES) || 5,
    });

    // Insertar el mensaje del asistente (la notificación)
    await insertMessage({
      sessionId: session.id,
      userId: user.id,
      role: "assistant",
      content: message,
      messageType: ConversationMessageType.OPEN,
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
