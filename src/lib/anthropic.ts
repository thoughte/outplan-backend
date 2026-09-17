import { ENV_CONFIG } from '../config/env.config';
import { getSetting } from '../config/app.config';

export interface ReasoningResult {
  text: string;
  model: string;
  stopReason: string | null;
  usage: { input: number; output: number } | null;
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
      content?: Array<{ type: string; text?: string }>;
      model?: string;
      stop_reason?: string | null;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text as string)
      .join('\n')
      .trim();

    if (!text) return null;

    return {
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
