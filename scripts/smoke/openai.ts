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

const structuredResultSchema = z.object({
  case_id: z.literal("case-s0"),
  capability: z.literal("structured_output"),
  ready: z.literal(true),
}).strict();

export async function smokeOpenAI(): Promise<SmokeResult> {
  loadLocalEnvironment();

  try {
    const apiKey = requireEnvironment("OPENAI_API_KEY");
    const model = requireEnvironment("OPENAI_MODEL");
    const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 });

    const toolResponse = await client.responses.create({
      model,
      input: "Call lookup_case exactly once for case-s0.",
      tools: [
        {
          type: "function",
          name: "lookup_case",
          description: "Read a synthetic smoke-test case by ID.",
          strict: true,
          parameters: {
            type: "object",
            properties: { case_id: { type: "string" } },
            required: ["case_id"],
            additionalProperties: false,
          },
        },
      ],
      tool_choice: { type: "function", name: "lookup_case" },
      parallel_tool_calls: false,
      max_output_tokens: 128,
      store: false,
    });

    const toolCall = toolResponse.output.find(
      (item) => item.type === "function_call",
    );
    if (!toolCall || toolCall.name !== "lookup_case") {
      throw new Error("EXPECTED_READ_ONLY_TOOL_CALL_NOT_OBSERVED");
    }
    const argumentsSchema = z.object({ case_id: z.literal("case-s0") }).strict();
    argumentsSchema.parse(JSON.parse(toolCall.arguments));

    const structuredResponse = await client.responses.create({
      model,
      input: "Return the S0 capability result for case-s0.",
      text: {
        format: {
          type: "json_schema",
          name: "s0_capability",
          strict: true,
          schema: {
            type: "object",
            properties: {
              case_id: { type: "string", enum: ["case-s0"] },
              capability: { type: "string", enum: ["structured_output"] },
              ready: { type: "boolean", enum: [true] },
            },
            required: ["case_id", "capability", "ready"],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 128,
      store: false,
    });

    structuredResultSchema.parse(JSON.parse(structuredResponse.output_text));

    return {
      provider: "OpenAI",
      status: "PASS",
      capability: "Responses API strict tool call and structured output",
      evidence: {
        model,
        tool_response_id: redactIdentifier(toolResponse.id),
        structured_response_id: redactIdentifier(structuredResponse.id),
        tool_call_valid: true,
        structured_output_valid: true,
        input_tokens:
          (toolResponse.usage?.input_tokens ?? 0) +
          (structuredResponse.usage?.input_tokens ?? 0),
        output_tokens:
          (toolResponse.usage?.output_tokens ?? 0) +
          (structuredResponse.usage?.output_tokens ?? 0),
      },
    };
  } catch (error) {
    const message = describeError(error);
    return {
      provider: "OpenAI",
      status: message.startsWith("MISSING_ENV:") ? "BLOCKED" : "FAIL",
      capability: "Responses API strict tool call and structured output",
      blocker: message,
    };
  }
}

if (directExecution(import.meta.url)) {
  printResult(await smokeOpenAI());
}
