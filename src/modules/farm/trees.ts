/** The quiz, and the trees it can land on.
 *
 *  Every question is about temperament or how someone spends a day. NONE is
 *  about health, and that is not squeamishness: the tree is shown on a share
 *  card and stands beside neighbours' farms, so if the quiz asked about
 *  symptoms the choice of tree would become a disclosure that travels.
 *
 *  The result can be rejected and another tree picked. Choice matters more than
 *  quiz accuracy, because the whole bet is that people care for what they chose.
 */

export type TreeKind = 'banyan' | 'mango' | 'neem' | 'cherry' | 'oak' | 'bamboo' | 'baobab';

export const TREES: { key: TreeKind; name: string; line: string }[] = [
  { key: 'banyan', name: 'Banyan', line: 'Patient, deep-rooted, shelter to everyone around you' },
  { key: 'mango', name: 'Mango', line: 'Generous and warm; you work hard for a sweet season' },
  { key: 'neem', name: 'Neem', line: 'Quietly tough; you protect the people near you' },
  { key: 'cherry', name: 'Cherry blossom', line: 'You live for moments and make them beautiful' },
  { key: 'oak', name: 'Oak', line: 'Steady and dependable; slow growth, lasting strength' },
  { key: 'bamboo', name: 'Bamboo', line: 'Flexible and fast; you bend and never break' },
  { key: 'baobab', name: 'Baobab', line: 'You store up strength and thrive where others struggle' },
];

export interface Question {
  id: string;
  ask: string;
  options: { label: string; leans: TreeKind[] }[];
}

/** Five questions, none of them medical.
 *
 *  Each answer leans towards two or three trees rather than one, so no single
 *  tap decides the result and nobody can reverse-engineer their way to a
 *  particular tree by answering "correctly".
 */
export const QUIZ: Question[] = [
  {
    id: 'sunday',
    ask: 'A free Sunday morning. Where are you?',
    options: [
      { label: 'Still in bed, unbothered', leans: ['banyan', 'baobab'] },
      { label: 'Out early, moving', leans: ['bamboo', 'oak'] },
      { label: 'Cooking something for everyone', leans: ['mango', 'banyan'] },
      { label: 'Somewhere new, camera out', leans: ['cherry', 'bamboo'] },
    ],
  },
  {
    id: 'plans',
    ask: 'Plans change at the last minute.',
    options: [
      { label: 'Fine, I adapt', leans: ['bamboo', 'cherry'] },
      { label: 'Annoying, but I manage', leans: ['oak', 'neem'] },
      { label: 'I had already planned for it', leans: ['baobab', 'oak'] },
      { label: 'I make it work for everyone else first', leans: ['banyan', 'mango'] },
    ],
  },
  {
    id: 'friends',
    ask: 'Your friends come to you for...',
    options: [
      { label: 'Advice they can rely on', leans: ['oak', 'banyan'] },
      { label: 'Getting them out of trouble', leans: ['neem', 'baobab'] },
      { label: 'A good time', leans: ['cherry', 'mango'] },
      { label: 'Getting something done fast', leans: ['bamboo', 'oak'] },
    ],
  },
  {
    id: 'hard',
    ask: 'A hard week. What gets you through?',
    options: [
      { label: 'Knowing it passes', leans: ['banyan', 'baobab'] },
      { label: 'Keeping busy', leans: ['bamboo', 'mango'] },
      { label: 'The people around me', leans: ['mango', 'banyan'] },
      { label: 'Stubbornness', leans: ['neem', 'oak'] },
    ],
  },
  {
    id: 'proud',
    ask: 'What are you quietly proud of?',
    options: [
      { label: 'That people feel safe with me', leans: ['banyan', 'neem'] },
      { label: 'That I keep going', leans: ['baobab', 'oak'] },
      { label: 'That I notice things', leans: ['cherry', 'neem'] },
      { label: 'That I get back up fast', leans: ['bamboo', 'cherry'] },
    ],
  },
];

/** Tally the leanings. Ties break by the order in TREES rather than at random,
 *  so the same answers always give the same tree - a quiz that varies its answer
 *  is a quiz nobody trusts a second time. */
export function treeFor(answers: Record<string, number>): TreeKind {
  const score = new Map<TreeKind, number>();
  for (const q of QUIZ) {
    const picked = q.options[answers[q.id] ?? -1];
    if (!picked) continue;
    for (const t of picked.leans) score.set(t, (score.get(t) ?? 0) + 1);
  }
  let best: TreeKind = TREES[0]!.key;
  let bestScore = -1;
  for (const t of TREES) {
    const n = score.get(t.key) ?? 0;
    if (n > bestScore) { best = t.key; bestScore = n; }
  }
  return best;
}
