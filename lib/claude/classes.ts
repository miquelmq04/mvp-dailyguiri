import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { MessageRole } from "../db/schema";

export abstract class AIProvider {
  abstract generateResponse(
    systemPrompt: string,
    input: AIMessage[] | string
  ): Promise<string>;

  // Midelware
  protected abstract processAIResponse(message: any): string;
}

export class ClaudeProvider extends AIProvider {
  private client: Anthropic; // El objeto Anthropic vive aquí

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  async generateResponse(
    systemPrompt: string,
    input: AIMessage[] | string
  ): Promise<string> {
    try {
      const message = await this.client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages:
          typeof input === "string"
            ? [{ role: "user", content: input }]
            : input,
      });
      return this.processAIResponse(message);
    } catch (error) {
      console.error("Error in Claude API call:", error);
      return "Sorry, the service is temporarily unavailable";
    }
  }

  protected processAIResponse(message: any): string {
    if (message.type === "error") {
      console.error("Claude API returned error:", message);
      throw new Error(
        "AI service error: " + (message.error?.message || "Unknown error")
      );
    }

    if (!message.content || message.content.length === 0) {
      console.error("Claude response has no content:", message);
      throw new Error("AI response has no content");
    }

    const firstBlock = message.content[0];
    if (firstBlock.type !== "text") {
      console.error("Claude response is not text type:", firstBlock.type);
      throw new Error(`Unexpected AI response type: ${firstBlock.type}`);
    }

    return firstBlock.text;
  }
}

export class GeminiProvider extends AIProvider {
  private client: GoogleGenAI;

  constructor(apiKey?: string) {
    super();
    this.client = new GoogleGenAI({
      apiKey: apiKey || process.env.GEMINI_API_KEY,
    });
  }

  async generateResponse(
    systemPrompt: string,
    input: AIMessage[] | string
  ): Promise<string> {
    try {
      if (typeof input === "string") {
        // Single message
        const response = await this.client.models.generateContent({
          model: "gemini-2.0-flash",
          contents: input,
          config: {
            systemInstruction: systemPrompt,
          },
        });
        return this.processAIResponse(response);
      } else {
        // Multi-turn conversation
        const history = this.formatHistory(input.slice(0, -1));
        const lastMessage = input[input.length - 1];

        const chat = this.client.chats.create({
          model: "gemini-3-flash-preview",
          history,
          config: {
            systemInstruction: systemPrompt,
          },
        });

        const response = await chat.sendMessage({
          message: lastMessage.content,
        });

        return this.processAIResponse(response);
      }
    } catch (error) {
      console.error("Error in Gemini API call:", error);
      return "Sorry, the service is temporarily unavailable";
    }
  }

  private formatHistory(messages: AIMessage[]): Array<{
    role: string;
    parts: Array<{ text: string }>;
  }> {
    return messages.map((msg) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));
  }

  protected processAIResponse(response: any): string {
    if (!response || !response.text) {
      console.error("Gemini response has no text:", response);
      throw new Error("AI response has no content");
    }

    return response.text;
  }
}

export class OpenAIProvider extends AIProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    super();
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENAI_API_KEY,
    });
  }

  async generateResponse(
    systemPrompt: string,
    input: AIMessage[] | string
  ): Promise<string> {
    try {
      const messages = this.formatOpenAIMessages(systemPrompt, input);

      const response = await this.client.responses.create({
        model: "gpt-4o-mini",
        input: messages,
        reasoning: {},
        temperature: 1,
        max_output_tokens: 2048,
      });

      return this.processAIResponse(response);
    } catch (error) {
      console.error("Error in OpenAI API call:", error);
      return "Sorry, the service is temporarily unavailable";
    }
  }

  private formatOpenAIMessages(
    systemPrompt: string,
    input: AIMessage[] | string
  ): any[] {
    const messages: any[] = [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: systemPrompt,
          },
        ],
      },
    ];

    if (typeof input === "string") {
      messages.push({
        role: "user",
        content: [
          {
            type: "input_text",
            text: input,
          },
        ],
      });
    } else {
      input.forEach((msg) => {
        messages.push({
          role: msg.role === MessageRole.USER ? "user" : "assistant",
          content: [
            {
              type:
                msg.role === MessageRole.USER ? "input_text" : "output_text",
              text: msg.content,
            },
          ],
        });
      });
    }

    return messages;
  }

  protected processAIResponse(response: any): string {
    if (response?.output_text) {
      return response.output_text;
    }

    // Fallback: check output array
    if (response?.output && Array.isArray(response.output)) {
      const textOutput = response.output.find(
        (item: any) => item.type === "output_text"
      );
      if (textOutput?.text) {
        return textOutput.text;
      }
    }

    console.error("OpenAI response has no text content:", response);
    throw new Error("AI response has no content");
  }
}

export type AIMessage = {
  role: MessageRole.ASSISTANT | MessageRole.USER;
  content: string;
};
