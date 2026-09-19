import { ENV_CONFIG } from '../config/env.config';
import { getSetting } from '../config/app.config';
import { reasoningFailed, reasoningWorked } from './reasoning-health';

export interface ReplyQuestion {
  text: string;
  options: string[];
}

export interface ReplyParts {
  /** One to three short bubbles. Sent in sequence, the way a person types. */
  messages: string[];
  /** At most one, and rarely. The default reply carries none: for a long time
   *  the prompt said "use it often" while this file said "only when it would
   *  change what you say next", and the prompt won, which is how every reply
   *  ended up with a question stapled to it. */
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
    'messages, the way you would actually type them. The default reply has NO ' +
    'question in it: you react, you say what you think, and you stop.',
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
          'Usually leave this out. A question is earned only when your next ' +
          'move genuinely forks on the answer: if you cannot name the two ' +
          'different replies you would give, you have not earned it. If you ' +
          'asked something in the last three or four replies, do not ask now, ' +
          'however good the question is. Never more than one, and never one ' +
          'here and another buried in the messages.',
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

/** Text that is the model talking about its own plumbing, not to the person.
 *
 *  This shipped. Someone described their sleep and the reply, in full, was
 *  "I'll use the reply tool." The model narrated its intention instead of
 *  calling the tool, there was no tool call to read, and the fallback below
 *  faithfully delivered that sentence as the answer.
 *
 *  The fallback itself is right - a model that answers in the wrong shape has
 *  still answered, and throwing that away helps nobody. But an announcement
 *  about a tool is not an answer in the wrong shape, it is stage direction, and
 *  showing it to someone who just told you how they slept is worse than saying
 *  nothing.
 */
const TOOL_TOKEN = /\b(reply[ _]tool|tool[ _]call|tool_use|function[ _]call)\b/i;
const ANNOUNCING = /\b(?:i(?:'ll| will)(?: now)?|let me)\s+(?:use|call|invoke)\s+(?:the\s+)?(?:reply\s+)?(?:tool|function)\b/i;

function isStageDirection(text: string): boolean {
  const t = text.trim();
  // "I will use a smaller dose next week" is a perfectly good answer, and an
  // earlier version of this blocked it - matching "i will use" on its own is
  // matching ordinary English. An actual tool noun has to be there.
  if (TOOL_TOKEN.test(t)) return t.length < 160;
  // "let me use the tool" without one of those tokens only counts when the
  // whole reply is that and nothing else. Someone's physiotherapy tool is a
  // real thing to talk about.
  return ANNOUNCING.test(t) && t.length < 60;
}

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

  // One retry, and only for a reply that came back unusable.
  //
  // The tool is forced, so a response with no tool call in it is the model
  // having slipped rather than anything about this person's message - and the
  // second attempt almost always lands. Retrying is cheaper than the failure it
  // prevents, which is someone describing their sleep and being answered with
  // silence, or worse, with "I'll use the reply tool."
  //
  // Strictly one. A model that will not produce the right shape twice will not
  // produce it on the fifth try either, and each attempt is a real cost against
  // a person who is waiting.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const out = await attemptReason(system, messages, opts);
    if (out) return out;
    if (attempt === 1) console.warn('[reason] no usable reply, trying once more');
  }
  return null;
}

async function attemptReason(
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  opts: { maxTokens?: number; timeoutMs?: number },
): Promise<ReasoningResult | null> {

  const model = await getSetting('reasoning.model').catch(() => 'claude-opus-5');
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
      // is not logged and its message is never stored. The service's own error
      // TYPE is a fixed vocabulary of its own making, so that is safe and it is
      // the part that distinguishes an expired credential from an overload.
      let type: string | undefined;
      try {
        type = (JSON.parse(await res.text()) as { error?: { type?: string } }).error?.type;
      } catch { /* not JSON */ }
      console.error('[reason] upstream returned', res.status, type ?? '');
      reasoningFailed({ status: res.status, type });
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
    // would be worse than showing it as one bubble - UNLESS what it wrote is
    // stage direction about the tool rather than anything addressed to them.
    const fallbackRaw = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text as string).join('\n').trim();
    const fallback = isStageDirection(fallbackRaw) ? '' : fallbackRaw;

    if (!parts && !fallback) {
      if (fallbackRaw) {
        console.error('[reason] discarded stage direction instead of replying:',
          JSON.stringify(fallbackRaw.slice(0, 80)));
      }
      // Nothing usable came back. Signalled as a failure so the caller can try
      // again, rather than dressed up as an answer.
      return null;
    }

    const final: ReplyParts | null = parts ?? { messages: [fallback] };

    const text = final.messages.join('\n\n') +
      (final.question ? `\n\n${final.question.text}` : '');

    reasoningWorked();
    return {
      parts: final,
      text,
      model: data.model ?? model,
      stopReason: data.stop_reason ?? null,
      usage: data.usage
        ? { input: data.usage.input_tokens ?? 0, output: data.usage.output_tokens ?? 0 }
        : null,
    };
  } catch (e) {
    // All the same to the caller, but not to anyone trying to work out why the
    // app went quiet.
    reasoningFailed({ status: 0, type: (e as Error).name });
    return null;
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
/** Markup that leaked into something meant to be plain text.
 *
 *  He asked "Tell me" and the entire reply he received was the five characters
 *  <br>. Before that, "No comments?" came back as "<br>" followed by the real
 *  sentence. React escapes HTML, so those rendered as literal text in the
 *  bubble - he saw <br> on screen and typed "?" because the app appeared to
 *  have said nothing.
 *
 *  ONLY known tag names are removed, never anything shaped like a tag. "BP
 *  <120/80", "under <5 mg", "<2 hours before bed" are all things someone says
 *  about their health, and a rule that stripped every <...> would silently eat
 *  the number. This is the same trap as the cleaner that once reduced a line of
 *  Hindi to a single space: remove what is definitely markup, leave everything
 *  else alone.
 */
const HTML_TAG = /<\/?(?:br|p|div|span|ul|ol|li|strong|em|b|i|small|hr)\s*\/?>/gi;

function stripMarkup(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')   // a line break meant a line break
    .replace(HTML_TAG, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalise(input: unknown): ReplyParts | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as { messages?: unknown; question?: unknown };

  // Cleaned BEFORE the emptiness check, not after. "<br>" is not an empty
  // string, so a check that runs first lets a bubble through containing nothing
  // a person can read - which is exactly what shipped.
  const messages = Array.isArray(raw.messages)
    ? raw.messages
        .filter((m): m is string => typeof m === 'string')
        .map(stripMarkup)
        .filter((m) => m !== '')
        .slice(0, 3)
    : [];
  // Nothing left means nothing to say. Returning null sends this back for one
  // retry instead of showing him markup and letting him wonder what happened.
  if (!messages.length) return null;

  let question: ReplyQuestion | undefined;
  const q = raw.question as { text?: unknown; options?: unknown } | undefined;
  if (q && typeof q.text === 'string' && q.text.trim() && Array.isArray(q.options)) {
    const options = q.options
      .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
      .map((o) => o.trim()).slice(0, 4);
    // NO NUMBERS IN OPTIONS.
    //
    // An option label is the assistant's words, not his. Tapping one is consent
    // to a sentence somebody else wrote, so it may let him choose among things
    // he said and must never supply a figure he did not. "400mg" offered as a
    // chip and tapped arrives at the server as his message, goes through
    // extraction, and becomes an amount in a medical record that he never
    // uttered. The model may still ask how much. It may not author the answer.
    //
    // Cost, accepted: a legitimate chip like "1-2 times" dies with this and has
    // to be typed.
    const wordsOnly = options.filter((o) => !/\d/.test(o));

    // One option is not a choice. Drop the question and keep the messages
    // rather than showing a button that asks nothing.
    if (wordsOnly.length >= 2) question = { text: q.text.trim(), options: wordsOnly };
  }

  return question ? { messages, question } : { messages };
}


/** A plain text call, no reply tool.
 *
 *  Used for work that is not a reply to a person - compacting a transcript,
 *  for instance. Forcing the reply tool there would produce chat bubbles where
 *  a summary was wanted.
 */
export async function reasonPlain(
  system: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  if (!ENV_CONFIG.ANTHROPIC_API_KEY) return null;
  const model = await getSetting('reasoning.model').catch(() => 'claude-opus-5');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 90_000);
  try {
    const res = await fetch(`${ENV_CONFIG.ANTHROPIC_BASE_URL.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ENV_CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 1024, system, messages }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      console.error('[reasonPlain] upstream returned', res.status);
      reasoningFailed({ status: res.status });
      return null;
    }
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? []).filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text as string).join('\n').trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
