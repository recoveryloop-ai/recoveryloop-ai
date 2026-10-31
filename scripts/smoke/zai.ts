import OpenAI from "openai";
import { z } from "zod";

import {
  describeError,
  directExecution,
  loadLocalEnvironment,
  printResult,
  redactIdentifier,
  requireEnvironment,
  type SmokeResult,
} from "./common.js";

const allowedBaseUrl = "https://api.z.ai/api/paas/v4";

const structuredResultSchema = z.object({
  case_id: z.literal("case-s0"),
  capability: z.literal("structured_output"),
  ready: z.literal(true),
}).strict();

export function assertZaiConfiguration(baseUrl: string, model: string): void {
  if (baseUrl.replace(/\/$/, "") !== allowedBaseUrl) {
    throw new Error("ZAI_BASE_URL_NOT_ALLOWLISTED");
  }
  if (model !== "glm-5.3") {
    throw new Error("ZAI_MODEL_NOT_APPROVED");
  }
}

export async function smokeZai(): Promise<SmokeResult> {
  loadLocalEnvironment();

  try {
    const apiKey = requireEnvironment("ZAI_API_KEY");
    const model = requireEnvironment("ZAI_MODEL");
    const baseURL = requireEnvironment("ZAI_BASE_URL");
    assertZaiConfiguration(baseURL, model);

    const client = new OpenAI({ apiKey, baseURL, timeout: 30_000, maxRetries: 0 });
    const toolResponse = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "This is a capability test. Call lookup_case once. Do not answer directly.",
        },
        { role: "user", content: "Look up case-s0." },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup_case",
            description: "Read a synthetic smoke-test case by ID.",
            parameters: {
              type: "object",
              properties: { case_id: { type: "string" } },
              required: ["case_id"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: "auto",
      reasoning_effort: "low",
      stream: false,
    });

    const toolCall = toolResponse.choices[0]?.message.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function" || toolCall.function.name !== "lookup_case") {
      throw new Error("EXPECTED_READ_ONLY_TOOL_CALL_NOT_OBSERVED");
    }
    z.object({ case_id: z.literal("case-s0") })
      .strict()
      .parse(JSON.parse(toolCall.function.arguments));

    const structuredResponse = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "Return only JSON matching exactly: " +
            '{"case_id":"case-s0","capability":"structured_output","ready":true}',
        },
        { role: "user", content: "Return the S0 capability result." },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "low",
      stream: false,
    });

    const content = structuredResponse.choices[0]?.message.content;
    if (!content) throw new Error("STRUCTURED_OUTPUT_EMPTY");
    structuredResultSchema.parse(JSON.parse(content));

    return {
      provider: "Z.ai",
      status: "PASS",
      capability: "GLM function call and validated JSON-mode output",
      evidence: {
        model,
        tool_response_id: redactIdentifier(toolResponse.id),
        structured_response_id: redactIdentifier(structuredResponse.id),
        tool_call_valid: true,
        structured_output_valid: true,
        input_tokens:
          (toolResponse.usage?.prompt_tokens ?? 0) +
          (structuredResponse.usage?.prompt_tokens ?? 0),
        output_tokens:
          (toolResponse.usage?.completion_tokens ?? 0) +
          (structuredResponse.usage?.completion_tokens ?? 0),
      },
    };
  } catch (error) {
    const message = describeError(error);
    return {
      provider: "Z.ai",
      status: message.startsWith("MISSING_ENV:") ? "BLOCKED" : "FAIL",
      capability: "GLM function call and validated JSON-mode output",
      blocker: message,
    };
  }
}

if (directExecution(import.meta.url)) {
  printResult(await smokeZai());
}
