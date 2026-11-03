import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import type {
  AiMessage,
  AiTurnRequest,
  AiTurnResponse,
  InvestigatorProvider,
} from "./investigator-provider";

const allowedBaseUrl = "https://api.z.ai/api/paas/v4";

export interface ZaiInvestigatorProviderOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
}

function toProviderMessage(message: AiMessage): ChatCompletionMessageParam {
  if (message.role === "system" || message.role === "user") return message;
  if (message.role === "tool") {
    return { role: "tool", content: message.content, tool_call_id: message.toolCallId };
  }
  if (!("toolCalls" in message)) throw new Error("AI_MESSAGE_ROLE_INVALID");
  return {
    role: "assistant",
    content: message.content,
    tool_calls: message.toolCalls.map((call) => ({
      id: call.id,
      type: "function" as const,
      function: { name: call.name, arguments: call.argumentsJson },
    })),
  };
}

export class ZaiInvestigatorProvider implements InvestigatorProvider {
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: ZaiInvestigatorProviderOptions) {
    const baseURL = options.baseUrl.replace(/\/$/, "");
    if (baseURL !== allowedBaseUrl) throw new Error("ZAI_BASE_URL_NOT_ALLOWLISTED");
    if (options.model !== "glm-5.3") throw new Error("ZAI_MODEL_NOT_APPROVED");
    this.model = options.model;
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL, timeout: 30_000, maxRetries: 0 });
  }

  async generate(request: AiTurnRequest): Promise<AiTurnResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages.map(toProviderMessage),
      tools: request.tools as readonly ChatCompletionTool[] as ChatCompletionTool[],
      tool_choice: "auto",
      ...(request.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      reasoning_effort: "low",
      max_tokens: 1_200,
      stream: false,
    });
    const message = response.choices[0]?.message;
    if (!message) throw new Error("ZAI_EMPTY_RESPONSE");
    return {
      content: message.content,
      toolCalls: (message.tool_calls ?? []).flatMap((call) => call.type === "function" ? [{
        id: call.id,
        name: call.function.name,
        argumentsJson: call.function.arguments,
      }] : []),
      responseId: response.id,
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
    };
  }
}
