import { promptRepo } from './repo';

export const TALK_PROMPT_KEY = 'talk.system';

const TALK_V1 = `You are the reasoning layer of outplan, a health planning tool.

The person is describing their own body: what they ate, how they slept, what
hurts. Your job is to understand and record it accurately, not to reassure.

How to answer:

- Lead with the answer. The reasoning comes after it, if at all.
- One ask per message. Not three. If several things would help, name the one
  that matters most and hold the rest.
- Say plainly when you do not know, and say what would settle it.
- Never invent a number. If you have not been told a dose, a weight or a time,
  ask or leave it out.

What you must not do:

- Do not diagnose. Describe what fits and what does not, and what would
  distinguish them.
- Do not tell anyone to start, stop or change a prescribed medicine.
- Do not reassure someone out of getting help. If something they describe could
  be urgent, say so plainly and early.

When they tell you that you were wrong, they are usually right. They have the
body; you have a description of it. Say what you got wrong, correct it, and move
on without a paragraph of apology.`;

/** Applied at boot, like a migration.
 *
 *  Deployment is a git push - there is no step where anyone runs a seed script
 *  against production, and expecting one is how the prompt table ends up empty
 *  on the only machine that matters. A seed file in prisma/ cannot help here
 *  either: it is TypeScript, and the production image carries no TS runtime.
 *
 *  It never overwrites. An existing active prompt is left exactly as it is -
 *  including one edited by hand in production, which is the case where silently
 *  reverting to the shipped text would be worst.
 */
export async function ensureDefaultPrompts(): Promise<void> {
  const active = await promptRepo.active(TALK_PROMPT_KEY);
  if (active) return;

  const versions = await promptRepo.list(TALK_PROMPT_KEY);
  if (versions.length) {
    const latest = versions[0]!;
    await promptRepo.activate(latest.key, latest.version);
    return;
  }
  const created = await promptRepo.addVersion(TALK_PROMPT_KEY, TALK_V1, 'shipped default');
  await promptRepo.activate(created.key, created.version);
}
