import { prisma } from '../../lib/prisma';
import { getSetting } from '../../config/app.config';
import { reasonPlain } from '../../lib/anthropic';
import { talkRepo } from './repo';

/** Turn = { role, content }. */
export type Turn = { role: 'user' | 'assistant'; content: string };

/** Roughly four characters to a token. Wrong in the third decimal place and
 *  right enough to budget with - the alternative is shipping a tokeniser to
 *  decide how many messages to send. */
const tokens = (s: string): number => Math.ceil(s.length / 4);

/**
 * What the model sees, and what happens when there is more of it than fits.
 *
 * A message count was the previous answer and it is not one: thirty one-line
 * days and thirty long ones are the same number and wildly different amounts of
 * context. This budgets in tokens, fills newest-first, and stops when the
 * budget is spent.
 *
 * Then the part that matters. Everything that did not fit is COMPACTED rather
 * than dropped - summarised once, stored on the person, and prepended to every
 * later conversation. Without it a long relationship silently forgets its own
 * beginning: the window fills, the oldest turns fall off the end, and something
 * said two hundred messages ago stops having happened.
 *
 * Compaction runs at most once per overflow and only over turns that are
 * already outside the window, so the same exchange is never summarised twice.
 * Summarising something still in the live context is how a summary starts
 * asserting things that were never said.
 */
export async function buildContext(
  userId: string, excludeId: string,
): Promise<{ turns: Turn[]; summary: string | null; dropped: number }> {
  const [budget, maxExchanges] = await Promise.all([
    getSetting('talk.context_token_budget').catch(() => 24000),
    getSetting('talk.context_exchanges').catch(() => 200),
  ]);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // NOT caught silently. An empty history looks identical to a working one from
  // the outside - the reply just quietly has no memory in it - and that is the
  // failure this whole module exists to prevent. Loud, or it did not happen.
  let rows: Awaited<ReturnType<typeof talkRepo.recent>>;
  try {
    rows = await talkRepo.recent(userId, maxExchanges, excludeId);
  } catch (e) {
    console.error('[context] history query failed, answering with NO memory:', (e as Error).message);
    rows = [];
  }

  // Walk backwards from the newest, spending budget until it runs out.
  const kept: Turn[] = [];
  let spent = 0;
  let cutoff: Date | null = null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const e = rows[i]!;
    const turns: Turn[] = [{ role: 'user', content: e.said }];
    if (e.replied) turns.push({ role: 'assistant', content: e.replied });
    for (const c of e.corrections) {
      turns.push({
        role: 'user',
        content: c.isRight
          ? `Correction: that was wrong. ${c.wasWrong} The correct version is: ${c.isRight}`
          : `Correction: that was wrong. ${c.wasWrong}`,
      });
    }
    const cost = turns.reduce((n, t) => n + tokens(t.content), 0);
    if (spent + cost > budget && kept.length) { cutoff = e.saidAt; break; }
    spent += cost;
    kept.unshift(...turns);
  }

  const dropped = cutoff ? rows.filter((r) => r.saidAt <= cutoff!).length : 0;
  let summary = user?.contextSummary ?? null;

  // Compact what fell outside the window, if it is not already compacted.
  if (cutoff && (!user?.contextSummaryThrough || user.contextSummaryThrough < cutoff)) {
    summary = await compact(userId, user?.contextSummary ?? null, user?.contextSummaryThrough ?? null, cutoff)
      .catch((e) => {
        console.error('[context] compaction threw:', (e as Error).message);
        return summary;
      });
  }

  return { turns: kept, summary, dropped };
}

/** Fold the turns between `from` and `through` into the existing summary.
 *
 *  The instruction matters more than the mechanism. A summary of a health
 *  conversation that keeps the shape and loses the specifics is worthless -
 *  "discussed diet" is not a memory. It is told to keep what someone would be
 *  annoyed to have to repeat.
 */
async function compact(
  userId: string, existing: string | null, from: Date | null, through: Date,
): Promise<string | null> {
  const rows = await prisma.exchange.findMany({
    where: { userId, saidAt: { ...(from ? { gt: from } : {}), lte: through } },
    include: { corrections: true },
    orderBy: { saidAt: 'asc' },
  });
  if (!rows.length) return existing;

  const transcript = rows.map((e) => {
    const lines = [`THEM: ${e.said}`];
    if (e.replied) lines.push(`YOU: ${e.replied}`);
    for (const c of e.corrections) lines.push(`THEY CORRECTED YOU: ${c.wasWrong}`);
    return lines.join('\n');
  }).join('\n\n');

  const result = await reasonPlain(
    `You are compacting the older part of a long health conversation so it is not
lost when it falls out of the context window.

Keep anything the person would be annoyed to have to say again: what they eat
and cannot eat, what they tried and what happened, symptoms and how they behave,
medicines and doses, decisions already made, and above all every time they
corrected you. A correction repeated is worse than a fact forgotten.

ONLY THE THEM LINES ARE FACTS. The YOU lines are your own guesses and your own
wording. You are encouraged to guess out loud in this conversation, which means
the transcript is full of confident sentences nobody confirmed. Keep something
off a YOU line only when a THEM line agreed with it, and then write it as the
thing they said. A guess folded into this summary is indistinguishable from
something they told you, and it stays in their record forever.

Also keep two things that are not facts, because the conversation breaks without
them. What is still open: something you asked that they have not answered, and
anything either of you left hanging. And what you dropped: a topic you said you
would stop raising, and roughly when. Without the first, a settled thing gets
reopened from zero. Without the second, a dropped thing comes back three days
later as a small aside, which is exactly what makes someone stop replying.

Drop small talk, pleasantries and anything already superseded.

Write it as short plain lines, not paragraphs. No preamble, no headings, no
"the user said". Under 400 words.`,
    [
      ...(existing ? [{ role: 'user' as const, content: `What you already remember:\n\n${existing}` }] : []),
      { role: 'user' as const, content: `Fold this in:\n\n${transcript}` },
    ],
    { maxTokens: 900 },
  );

  if (!result) {
    // The turns are outside the window and now have no summary either, so this
    // is the moment memory is actually lost. It must not pass quietly: the
    // conversation continues looking normal while the beginning of it is gone.
    console.error(
      `[context] compaction produced nothing for ${rows.length} exchanges up to ` +
      `${through.toISOString()} - that history is now outside the window with no ` +
      `summary. Check ANTHROPIC_API_KEY and the upstream.`);
    return existing;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { contextSummary: result, contextSummaryThrough: through },
  });
  return result;
}
