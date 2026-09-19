/** Words that mean stop the game and say something plain.
 *
 *  The PRD requires an immediate, neutral-voice message to seek urgent care when
 *  certain things are said. That message is not the tree's to deliver: a warm,
 *  playful voice telling someone their chest pain might be serious is a tonal
 *  failure at the worst possible moment.
 *
 *  Deliberately WIDE and deliberately dumb. A false positive costs someone a
 *  paragraph they did not need; a false negative costs the thing this whole
 *  product exists to protect. It runs BEFORE the model, on their own words, so
 *  it cannot be talked out of firing.
 */

export interface RedFlag { reason: string; say: string }

const URGENT: { re: RegExp; reason: string }[] = [
  { re: /\b(chest pain|chest tightness|pain in my chest|seene mein dard)\b/i, reason: 'chest pain' },
  { re: /\b(can'?t breathe|cannot breathe|short of breath|breathless|saans nahi)\b/i, reason: 'trouble breathing' },
  { re: /\b(face drooping|slurred speech|numb on one side|weakness on one side)\b/i, reason: 'possible stroke signs' },
  { re: /\b(coughing blood|vomiting blood|blood in my (stool|urine|vomit))\b/i, reason: 'bleeding' },
  { re: /\b(worst headache|thunderclap)\b/i, reason: 'sudden severe headache' },
  { re: /\b(kill myself|end my life|want to die|suicide|self.?harm|hurt myself)\b/i, reason: 'thoughts of self-harm' },
  { re: /\b(fainted|passed out|blacked out|lost consciousness)\b/i, reason: 'losing consciousness' },
];

const CARE = [
  'This is the plain-voice part, not the game.',
  'What you have described is the kind of thing that needs to be looked at now, not tomorrow.',
  'In India, call 112 for emergency services or 108 for an ambulance. If you are elsewhere, call your local emergency number.',
  'If you can, have someone with you.',
].join('\n\n');

const CRISIS = [
  'This is the plain-voice part, not the game.',
  'What you said matters and I am not going to talk around it. Please talk to someone tonight, not later.',
  'In India you can call or text 9152987821 (iCall) or 14416 (Tele-MANAS), both free and any hour. Elsewhere, your local crisis line.',
  'If you are in danger right now, call 112.',
  'I am still here, and we can talk about anything you want after.',
].join('\n\n');

export function redFlag(said: string): RedFlag | null {
  for (const u of URGENT) {
    if (!u.re.test(said)) continue;
    const selfHarm = u.reason === 'thoughts of self-harm';
    return { reason: u.reason, say: selfHarm ? CRISIS : CARE };
  }
  return null;
}
