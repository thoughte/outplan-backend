import { notFound } from '../../errors/app.errors';
import { userRepo } from './repo';
import { canonicalZone, isUsableZone } from '../../shared/helper';
import { toUserResponse, type UpdateMeInput, type UserResponse } from './types';

export interface UserService {
  me(userId: string): Promise<UserResponse>;
  updateMe(userId: string, input: UpdateMeInput): Promise<UserResponse>;
  ensureFromEmail(email: string): Promise<UserResponse>;
}

export const userService: UserService = {
  async me(userId) {
    const u = await userRepo.findById(userId);
    if (!u) throw notFound('No such account');
    return toUserResponse(u);
  },

  async updateMe(userId, input) {
    // Only what was sent. A patch that writes every field would blank the ones
    // the caller left out, which on a profile screen means saving a city
    // quietly erases the name that the report check depends on.
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.city !== undefined) data.city = input.city;
    if (input.timezone !== undefined) {
      // Canonical, and only if it is real. A browser in Kanpur reports
      // "Asia/Calcutta"; storing that beside another account's "Asia/Kolkata"
      // makes one city look like two. A zone that cannot be formatted is
      // dropped rather than stored, because it would throw on every later use
      // rather than on this one.
      const tz = canonicalZone(input.timezone);
      if (isUsableZone(tz)) data.timezone = tz;
    }
    if (input.dateOfBirth !== undefined) data.dateOfBirth = new Date(`${input.dateOfBirth}T00:00:00Z`);

    if (!Object.keys(data).length) return this.me(userId);
    return toUserResponse(await userRepo.update(userId, data));
  },

  /** Called by the auth middleware on every verified request. Firebase owns
   *  identity; this owns everything about the person, and the email is the only
   *  thing that crosses between them. */
  async ensureFromEmail(email) {
    return toUserResponse(await userRepo.upsertByEmail(email));
  },
};
