import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** What the app can do, told to the assistant in plain words.
 *
 *  Generated from `docs/features/`, which already says what each surface is FOR
 *  and why, in the words of whoever decided it. A second hand-written
 *  description of the product is a document that is wrong within a week, and
 *  wrong in the worst way: confidently, to someone asking how to use their own
 *  health app.
 *
 *  It takes the first paragraph under the heading and nothing else. The plans
 *  run to hundreds of lines of trade-offs and rejected alternatives, which is
 *  exactly what the next engineer needs and exactly what the assistant does
 *  not. It needs to know the farm exists, what it is for, and that it never
 *  shows results.
 *
 *  Read once per process. These files change on deploy, not at runtime.
 */

let cached: string | null = null;

/** Plans that describe a decision rather than a surface a person can open. */
const NOT_A_FEATURE = new Set(['README.md', 'goal-duplicates.md']);

/** The one line each plan writes for the assistant.
 *
 *  Not the first paragraph. Feature plans open with engineering history, and
 *  generating user help out of that produced sentences like "Marked superseded
 *  once, wrongly" as an answer to how the app works. It was tried and it was
 *  useless.
 *
 *  So each plan carries a line beginning `In the app:` saying what a person can
 *  actually do. It lives in the plan rather than in a second document, so the
 *  two cannot disagree, and writing one is part of writing a plan. A plan with
 *  no such line describes something a person cannot open, and is skipped.
 */
function inTheApp(markdown: string): string {
  const line = markdown.split('\n').find((l) => l.trim().startsWith('In the app:'));
  return line ? line.trim().slice('In the app:'.length).trim() : '';
}

export async function platformNotes(dir = 'docs/features'): Promise<string> {
  if (cached !== null) return cached;
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.md') && !NOT_A_FEATURE.has(f));
    const entries: string[] = [];

    for (const f of files.sort()) {
      const text = await readFile(join(dir, f), 'utf8');
      const body = inTheApp(text);
      if (!body) continue;
      entries.push(body);
    }

    cached = entries.length
      ? [
          'WHAT THIS APP CAN DO. Someone asking how to use it should get a real',
          'answer, not a guess. If a surface below does what they are asking for,',
          'say so and say where it is. If nothing here does it, say that plainly',
          'rather than inventing a feature, because a person going to look for a',
          'screen that does not exist is worse off than one who was told no.',
          '',
          ...entries.map((e) => `  ${e}`),
        ].join('\n')
      : '';
    return cached;
  } catch {
    // A missing docs directory is not worth failing a conversation over. The
    // assistant simply does not get this section.
    cached = '';
    return cached;
  }
}
