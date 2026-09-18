import { z } from 'zod';
import type { Role, User } from '../../../generated/prisma/client';

export interface UserResponse {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  dateOfBirth: string | null;
  city: string | null;
  timezone: string;
  /** Age in whole years, worked out rather than stored.
   *
   *  Stored age is a number that rots without anyone touching it. This one is
   *  right every morning because it is derived from the date every time. */
  age: number | null;
  /** Whether the app knows who this is well enough to do its job.
   *
   *  Derived from the fields being present, never stored as a flag. A flag set
   *  once outlives someone clearing a field, and then the app is certain about
   *  something that stopped being true. */
  needsSetup: boolean;
  createdAt: string;
}

export const updateMeSchema = z.object({
  /** As it appears on medical reports. The screen says so, because this is what
   *  every uploaded report is matched against before a number is read from it,
   *  and a nickname here silently disables that check. */
  // Two words minimum. One name is not an identity: "Khanna" matches every
  // report in a household that shares a surname, and this app already has two
  // Khanna accounts. Refused here rather than accepted and silently ignored by
  // the report check, which would look like the check was working.
  name: z.string().trim().max(120)
    .refine((v) => v.split(/\s+/).filter((p) => p.length > 2).length >= 2,
      'Give your full name as it appears on your reports, first and last')
    .optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  city: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().min(1).max(64).optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

/** Whole years, counting backwards from today. */
export function ageFrom(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < dob.getUTCMonth()
    || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Never return the row. A mapper is the only place that decides what leaves
 *  the server, so a column added later is invisible until someone adds it here
 *  on purpose. */
export function toUserResponse(u: User): UserResponse {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name,
    dateOfBirth: u.dateOfBirth ? u.dateOfBirth.toISOString().slice(0, 10) : null,
    city: u.city,
    timezone: u.timezone,
    age: ageFrom(u.dateOfBirth),
    // Name and date of birth only.
    //
    // City was asked for as free text and that was wrong: "kanpur", "Kanpur",
    // "Kanpur, UP" cannot be grouped or validated, and the timezone was coming
    // from the device anyway - so the field asked a question and then ignored
    // the answer. Until there is a proper picker, the clock comes from the
    // device and the column stays empty rather than holding a string nobody can
    // use.
    needsSetup: !u.name || !u.dateOfBirth,
    createdAt: u.createdAt.toISOString(),
  };
}
