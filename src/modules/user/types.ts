import { z } from 'zod';
import type { Role, User } from '../../../generated/prisma/client';

export interface UserResponse {
  id: string;
  email: string;
  role: Role;
  timezone: string;
  createdAt: string;
}

export const updateMeSchema = z.object({
  timezone: z.string().min(1).max(64).optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

/** Never return the row. A mapper is the only place that decides what leaves
 *  the server, so a column added later is invisible until someone adds it here
 *  on purpose. */
export function toUserResponse(u: User): UserResponse {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    timezone: u.timezone,
    createdAt: u.createdAt.toISOString(),
  };
}
