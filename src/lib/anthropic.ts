import { ENV_CONFIG } from '../config/env.config';
import { getSetting } from '../config/app.config';

export interface ReplyQuestion {
  text: string;
  options: string[];
}

export interface ReplyParts {
  /** One to three short bubbles. Sent in sequence, the way a person types. */
  messages: string[];
  /** At most one, and only when an answer would actually change what happens
   *  next. Tappable options beat a paragraph listing possibilities. */
  question?: ReplyQuestion;
}

export interface ReasoningResult {
  /** The parts, for showing. */
  parts: ReplyParts;
  /** The same thing flattened, for the next turn's history. A model reading its
   *  own previous answer does not need to know it arrived in three bubbles. */
  text: string;
  model: string;
  stopReason: string | null;
  usage: { input: number; output: number } | null;
}

/** The model answers by calling this. A forced tool call gives a shape the
 *  server can rely on; asking for JSON in the prompt and parsing it works until
 *  the day it does not, and that day arrives silently. */
const REPLY_TOOL = {
  name: 'reply',
  description:
    'Reply to the person. Break what you want to say into one to three short ' +
    'messages, the way you would actually type them. Ask a question only when ' +
    'the answer would change what you say next.',
  input_schema: {
    type: 'object' as const,
    properties: {
      messages: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 3,
        description:
          'One to three short messages. Each is its own bubble. Two sentences ' +
          'each at most. Do not split mid-thought just to make three.',
      },
      question: {
        type: 'object',
        description:
          'Optional. Only when an answer changes what happens next, and never ' +
          'more than one.',
        properties: {
          text: { type: 'string', description: 'The question, in one short line.' },
          options: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 4,
            description:
              'Two to four answers they can tap. Each a few words. They can ' +
              'always type something else instead, so these do not need to cover ' +
              'every case - just the likely ones.',
          },
        },
        required: ['text', 'options'],
      },
    },
    required: ['messages'],
  },
};

/** Claude, on the reasoning path only.
 *
 *  Plain fetch rather than the SDK, for two reasons. ANTHROPIC_BASE_URL points
 *  at a proxy, and an SDK that rewrites paths or injects its own headers is one
 *  more thing between a prompt and the answer it produced. And this is roughly
 *  forty lines - a dependency that ships a retry policy nobody chose is not
 *  worth the forty lines it saves.
 *
 *  It NEVER throws for a model failure. The caller stores the person's words
 *  either way: a message that cannot be answered must still be recorded, or the
 *  product loses the thing it exists to keep.
 */
export async function reason(
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<ReasoningResult | null> {
  if (!ENV_CONFIG.ANTHROPIC_API_KEY) return null;
  if (!(await getSetting('reasoning.enabled').catch(() => false))) return null;

  const model = await getSetting('reasoning.model').catch(() => 'claude-sonnet-5');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 60_000);

  try {
    const res = await fetch(`${ENV_CONFIG.ANTHROPIC_BASE_URL.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ENV_CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system,
        messages,
        tools: [REPLY_TOOL],
        tool_choice: { type: 'tool', name: REPLY_TOOL.name },
      }),
      signal: ctl.signal,
    });

    if (!res.ok) {
      // The body can carry the person's own words back in an error echo, so it
      // is not logged. The status is enough to tell an outage from a bad key.
      console.error('[reason] upstream returned', res.status);
      return null;
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
      model?: string;
      stop_reason?: string | null;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const call = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === REPLY_TOOL.name);
    const parts = normalise(call?.input);

    // Fall back to plain text if the tool call is missing or unusable. A model
    // that answered in the wrong shape still answered, and throwing that away
    // would be worse than showing it as one bubble.
    const fallback = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text as string).join('\n').trim();

    const final: ReplyParts | null = parts ?? (fallback ? { messages: [fallback] } : null);
    if (!final) return null;

    const text = final.messages.join('\n\n') +
      (final.question ? `\n\n${final.question.text}` : '');

    return {
      parts: final,
      text,
      model: data.model ?? model,
      stopReason: data.stop_reason ?? null,
      usage: data.usage
        ? { input: data.usage.input_tokens ?? 0, output: data.usage.output_tokens ?? 0 }
        : null,
    };
  } catch {
    return null;   // timeout, network, malformed JSON - all the same to the caller
  } finally {
    clearTimeout(timer);
  }
}

/** Trust nothing about the shape that came back.
 *
 *  Tool schemas are honoured almost always, and "almost" is the whole reason
 *  this exists: a missing array or a question with one option would otherwise
 *  reach the browser and render as an empty bubble or a single pointless button.
 */
function normalise(input: unknown): ReplyParts | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { messages?: unknown; question?: unknown };

  const messages = Array.isArray(raw.messages)
    ? raw.messages.filter((m): m is string => typeof m === 'string' && m.trim() !== '')
        .map((m) => m.trim()).slice(0, 3)
    : [];
  if (!messages.length) return null;

  let question: ReplyQuestion | undefined;
  const q = raw.question as { text?: unknown; options?: unknown } | undefined;
  if (q && typeof q.text === 'string' && q.text.trim() && Array.isArray(q.options)) {
    const options = q.options
      .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
      .map((o) => o.trim()).slice(0, 4);
    // One option is not a choice. Drop the question and keep the messages
    // rather than showing a button that asks nothing.
    if (options.length >= 2) question = { text: q.text.trim(), options };
  }

  return question ? { messages, question } : { messages };
}
