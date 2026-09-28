// Minimal OpenAI Chat Completions wrapper (plain fetch, no SDK) with strict
// structured outputs — spec/05 + 07. Logs only: endpoint, ms, model, usage.
// NEVER log images or note text.

interface ChatMessage {
  role: 'system' | 'user';
  content: string | Array<{ type: string; [k: string]: unknown }>;
}

export interface OpenAiCallOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

export class OpenAiError extends Error {
  constructor(public openaiMessage: string) {
    super(openaiMessage);
  }
}

export async function callOpenAiJson(opts: OpenAiCallOptions): Promise<unknown> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 600,
      response_format: {
        type: 'json_schema',
        json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
      },
    }),
  });

  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string; refusal?: string } }>;
    usage?: unknown;
  } | null;

  if (!res.ok || !body) {
    throw new OpenAiError(body?.error?.message ?? `OpenAI HTTP ${res.status}`);
  }
  const msg = body.choices?.[0]?.message;
  if (msg?.refusal) throw new OpenAiError(`Model refused: ${msg.refusal}`);
  const content = msg?.content;
  if (!content) throw new OpenAiError('Empty response from OpenAI.');

  console.log(
    JSON.stringify({ at: new Date().toISOString(), model: opts.model, usage: body.usage ?? null }),
  );

  try {
    return JSON.parse(content);
  } catch {
    throw new OpenAiError('OpenAI returned non-JSON content.');
  }
}
