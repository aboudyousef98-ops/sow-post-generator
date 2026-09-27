// POST /api/<token>/extract — screenshot → SfFields via vision (spec/05 §A, 07).

import { z } from 'zod';
import { guardRequest, jsonResponse, readGuardConfig, readJsonBody } from './lib/guard';
import { callOpenAiJson, OpenAiError } from './lib/openai';

const RequestSchema = z
  .object({
    imageDataUrl: z
      .string()
      .max(6 * 1024 * 1024)
      .regex(/^data:image\/(png|jpeg);base64,/),
  })
  .strict();

const nullableString = z.string().nullable();
const ResponseSchema = z
  .object({
    recordTitle: nullableString,
    customerName: nullableString,
    systemSizeKw: z.number().nullable(),
    projectStatus: nullableString,
    installScheduledDate: nullableString,
    latestScheduledVisit: nullableString,
    siteAddress: nullableString,
    jurisdiction: nullableString,
    utility: nullableString,
    lender: nullableString,
    fundingStage: nullableString,
    installRegionRaw: nullableString,
    scheduledWorkItems: nullableString,
    unscheduledWorkItems: nullableString,
    coordinatorNotes: nullableString,
    confidence: z.enum(['high', 'medium', 'low']),
  })
  .strict();

// System prompt — verbatim from spec/05-ai-prompts.md §A.
const SYSTEM_PROMPT = `You extract fields from a screenshot of a Salesforce "Fulfillment" record used by a solar installer.
Return ONLY the JSON object described by the schema. Copy values exactly as displayed; do not guess.
If a field is not visible, return null. Dates: return as YYYY-MM-DD. System size: number in kW.
"Scheduled Work Items" and "Coordinator Notes" may be partially cut off — return what is visible.`;

const nullableStr = { type: ['string', 'null'] };
const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recordTitle: nullableStr,
    customerName: nullableStr,
    systemSizeKw: { type: ['number', 'null'] },
    projectStatus: nullableStr,
    installScheduledDate: { ...nullableStr, description: 'YYYY-MM-DD' },
    latestScheduledVisit: nullableStr,
    siteAddress: nullableStr,
    jurisdiction: nullableStr,
    utility: nullableStr,
    lender: nullableStr,
    fundingStage: nullableStr,
    installRegionRaw: nullableStr,
    scheduledWorkItems: nullableStr,
    unscheduledWorkItems: nullableStr,
    coordinatorNotes: nullableStr,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: [
    'recordTitle',
    'customerName',
    'systemSizeKw',
    'projectStatus',
    'installScheduledDate',
    'latestScheduledVisit',
    'siteAddress',
    'jurisdiction',
    'utility',
    'lender',
    'fundingStage',
    'installRegionRaw',
    'scheduledWorkItems',
    'unscheduledWorkItems',
    'coordinatorNotes',
    'confidence',
  ],
};

export default async (req: Request): Promise<Response> => {
  const started = Date.now();
  const cfg = readGuardConfig(process.env);
  const guard = guardRequest(cfg, req);
  if (!guard.ok) return jsonResponse(guard.status ?? 403, { error: 'forbidden' }, guard.corsOrigin);
  const cors = guard.corsOrigin;
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method not allowed' }, cors);

  const body = await readJsonBody(req);
  if (body === 'too-large') return jsonResponse(413, { error: 'payload too large' }, cors);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return jsonResponse(400, { error: 'bad payload' }, cors);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonResponse(502, { error: 'AI unavailable', openai: 'OPENAI_API_KEY not set' }, cors);
  const model = process.env.OPENAI_MODEL_VISION || 'gpt-4o';

  try {
    const raw = await callOpenAiJson({
      apiKey,
      model,
      schemaName: 'sf_fields',
      schema: JSON_SCHEMA,
      temperature: 0,
      maxTokens: 1200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: parsed.data.imageDataUrl } },
            { type: 'text', text: 'Extract the fulfillment record fields.' },
          ],
        },
      ],
    });
    const fields = ResponseSchema.safeParse(raw);
    if (!fields.success)
      return jsonResponse(502, { error: 'AI returned unexpected shape', openai: 'schema mismatch' }, cors);
    console.log(JSON.stringify({ at: new Date().toISOString(), endpoint: 'extract', ms: Date.now() - started, model }));
    return jsonResponse(200, { fields: fields.data, model, ms: Date.now() - started }, cors);
  } catch (err) {
    const msg = err instanceof OpenAiError ? err.openaiMessage : 'AI request failed';
    return jsonResponse(502, { error: 'AI request failed', openai: msg.slice(0, 500) }, cors);
  }
};
