/** Whether the reasoning service is actually answering.
 *
 *  This exists because of a silent outage. The production credential is an
 *  OAuth session rather than a plain key, it expired, and the service began
 *  returning `500 Failed to authenticate: OAuth session expired and could not
 *  be refreshed` to every call. Chat replies, record extraction, conversation
 *  compaction and goal decomposition all go through that one call, so all four
 *  stopped working at once.
 *
 *  Nothing noticed. `/health` checked that the key was PRESENT, which it was,
 *  and answered `ok: true` throughout. A key being set is not the same claim as
 *  a service answering, and only the second one is worth reporting.
 *
 *  It records what already happened rather than probing. A probe on every
 *  healthcheck would call a paid service every thirty seconds to learn
 *  something the last real call already knew.
 */

export interface ReasoningHealth {
  /** null until the first call of this process. Unknown is not failure: a box
   *  that has just started and been asked nothing has nothing to report. */
  ok: boolean | null;
  at: string | null;
  status?: number;
  type?: string;
  message?: string;
  /** Consecutive failures. One is a blip, a run of them is an outage. */
  failures: number;
}

const state: ReasoningHealth = { ok: null, at: null, failures: 0 };

export function reasoningWorked(): void {
  state.ok = true;
  state.at = new Date().toISOString();
  state.failures = 0;
  delete state.status;
  delete state.type;
  delete state.message;
}

export function reasoningFailed(detail: { status?: number; type?: string; message?: string }): void {
  state.ok = false;
  state.at = new Date().toISOString();
  state.failures += 1;
  state.status = detail.status;
  state.type = detail.type;
  // Truncated, and it is the SERVICE's message about itself, never anything
  // belonging to the person who happened to be talking when it broke.
  state.message = detail.message?.slice(0, 300);
}

export function reasoningHealth(): ReasoningHealth {
  return { ...state };
}

/** An expired or rejected credential, as opposed to a busy or broken service.
 *
 *  Worth separating because the two need opposite responses. A 429 or a 529
 *  wants waiting; a 401, a 403, or an auth error inside a 500 wants a human to
 *  go and renew something, and no amount of restarting will do it. */
export function looksLikeCredential(h: ReasoningHealth): boolean {
  if (h.ok !== false) return false;
  if (h.status === 401 || h.status === 403) return true;
  return /auth|credential|expired|oauth|api[_ ]key/i.test(`${h.type ?? ''} ${h.message ?? ''}`);
}
