import { notFound } from '../../errors/app.errors';
import { userRepo } from './repo';
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
    if (!input.timezone) return this.me(userId);
    const u = await userRepo.updateTimezone(userId, input.timezone);
    return toUserResponse(u);
  },

  /** Called by the auth middleware on every verified request. Firebase owns
   *  identity; this owns everything about the person, and the email is the only
   *  thing that crosses between them. */
  async ensureFromEmail(email) {
    return toUserResponse(await userRepo.upsertByEmail(email));
  },
};
