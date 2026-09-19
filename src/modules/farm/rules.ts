/** What the farm looks like, worked out from what actually happened.
 *
 *  The farm is a VIEW. Nothing about its state is stored, because two stores for
 *  one fact drift and the one people look at would be the wrong one. Every
 *  mechanic below is a query over rows that already exist for their own reasons:
 *  observations written from conversation, plan items ticked, files uploaded.
 *
 *  Five rules from the PRD and from him, and they are what make this safe rather
 *  than just pretty.
 *
 *  NOTHING DIES. There is no state below "needs attention". A farm that can be
 *  killed is a farm someone stops opening after a bad week, which is the week
 *  they most need it.
 *
 *  PROBLEMS ARE PRIVATE, REWARDS ARE PUBLIC. Only the owner sees a problem
 *  state. And the harder half: ABSENCE MUST NOT SIGNAL. A farm with no fireflies
 *  has to look the same whether its owner sleeps badly or has not unlocked them,
 *  because a missing reward is itself information.
 *
 *  WEEKS, NOT STREAKS. Five of seven days, so a bad Tuesday is not a broken
 *  chain. A quiet week makes the farm sleepy, never damaged.
 *
 *  EFFORT, NOT OUTCOME. Nothing here reads a lab value. Growth tracks what
 *  someone did, never what their blood says, or the game would reward a number
 *  they cannot directly change and punish an illness.
 *
 *  MORE IS NOT BETTER. Every mechanic caps at its target. A game that can be won
 *  by drinking more water than a person should is a game that will be.
 */

export type Health = 'thriving' | 'steady' | 'needs_attention' | 'dormant' | 'unknown';

export interface Mechanic {
  key: string;
  /** What the person sees, not what it reads from. */
  scene: string;
  health: Health;
  /** Days out of the window this happened. */
  days: number;
  window: number;
  /** The amount where one was given, summed or averaged as makes sense. */
  amount: number | null;
  unit: string | null;
  /** Said plainly. The farm should never be the only explanation of itself. */
  note: string;
}

/** Five of seven. Not a streak.
 *
 *  `unknown` rather than `needs_attention` when nothing has been logged at all.
 *  Those are different facts, and showing an empty week as a problem tells
 *  someone their farm is suffering when really the app has never been told
 *  anything. */
export function healthFrom(days: number, window: number, everLogged: boolean): Health {
  if (!everLogged) return 'unknown';
  if (days >= Math.ceil(window * 0.71)) return 'thriving';   // 5 of 7
  if (days >= Math.ceil(window * 0.42)) return 'steady';     // 3 of 7
  if (days > 0) return 'needs_attention';
  return 'dormant';
}

/** A visitor is earned by a habit held, and stays earned.
 *
 *  Nothing on the farm is ever taken back. A bird that leaves when someone has a
 *  hard week turns the farm into a scoreboard, and the whole point is that it is
 *  not one.
 */
export interface Visitor {
  key: string;
  name: string;
  /** Why it arrived, in the person's own terms. Every reward is tappable and
   *  explains itself: that is what makes a neighbour's farm teach anything. */
  earnedFor: string;
  earned: boolean;
}

export const VISITOR_RULES: { key: string; name: string; earnedFor: string; mechanic: string; needs: number }[] = [
  { key: 'fireflies', name: 'Fireflies', earnedFor: 'Sleep logged five nights in a week', mechanic: 'sleep', needs: 5 },
  { key: 'ladybirds', name: 'Ladybirds', earnedFor: 'Every dose taken, five days in a week', mechanic: 'medication', needs: 5 },
  { key: 'dew', name: 'Morning dew', earnedFor: 'Water logged five days in a week', mechanic: 'hydration', needs: 5 },
  { key: 'swallow', name: 'A swallow', earnedFor: 'Moving on three days in a week', mechanic: 'activity', needs: 3 },
  { key: 'bees', name: 'Bees', earnedFor: 'Meals logged five days in a week', mechanic: 'nutrition', needs: 5 },
  { key: 'well', name: 'A well', earnedFor: 'Any medical record added', mechanic: 'roots', needs: 1 },
];
