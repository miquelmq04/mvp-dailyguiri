import Anthropic from "@anthropic-ai/sdk";
import { Message, MessageRole } from "../db/schema";

export type ClaudeMessage = {
  role: MessageRole.ASSISTANT | MessageRole.USER;
  content: string;
};

export async function callClaudeAPI(
  systemPrompt: string,
  input: ClaudeMessage[] | string
) {
  // TODO: Abstreure tota la logica de la IA en una classe
  if (process.env.USE_MOCK_CLAUDE === "true") {
    return typeof input === "string"
      ? await simulateClaudeAPI(0)
      : await simulateClaudeAPI(input.length);
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages:
      typeof input === "string"
        ? [
            {
              role: "user",
              content: input,
            },
          ]
        : input,
  });

  return message;
}

export async function simulateClaudeAPI(conversationLength: number) {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const simulatedResponse = {
    id: "msg_018gCsTGsXkYJVqYPxTgDHBU",
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: `Response: Message ${conversationLength}`,
      },
    ],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 30,
      output_tokens: 309,
    },
  };

  return simulatedResponse;
}
