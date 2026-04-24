import {
  AIProvider,
  ClaudeProvider,
  GeminiProvider,
  OpenAIProvider,
} from "./classes";

let aiProviderInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!aiProviderInstance) {
    const providerName = process.env.AI_PROVIDER;
    if (providerName === "ANTROPHIC")
      aiProviderInstance = new ClaudeProvider(process.env.ANTHROPIC_API_KEY!);
    else if (providerName === "GEMINI")
      aiProviderInstance = new GeminiProvider(process.env.GEMINI_API_KEY!);
    else if (providerName === "OPENAI")
      aiProviderInstance = new OpenAIProvider(process.env.OPENAI_API_KEY!);
    else {
      throw Error("Bad AI Provider configuration");
    }
  }
  return aiProviderInstance;
}
