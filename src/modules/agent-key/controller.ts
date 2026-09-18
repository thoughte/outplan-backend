import type { NextFunction, Response } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized, forbidden } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { createHash, randomBytes } from 'node:crypto';
import { badRequest } from '../../errors/app.errors';
import { agentKeyRepo } from './repo';
import { AGENT_PREFIX, createKeySchema, MAX_LIVE_KEYS } from './types';

export const agentKeyController = {
  /** Grant the agent access to this record.
   *
   *  Issued HERE, by him, in his own settings - not minted on a laptop and
   *  handed over. That is the whole distinction between a key and a backdoor:
   *  someone deliberately granted it, it appears in a list, and it can be taken
   *  back.
   *
   *  The secret is returned exactly once and never stored. If he loses it he
   *  issues another and revokes this one, which is the correct answer - a system
   *  that can show you a key again is a system that is keeping it somewhere.
   */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      // A key must not be able to mint keys. Otherwise revoking one means
      // nothing: it could have issued three more before you got there.
      if (req.agentKey) throw forbidden('Only you can create a key, not an agent');

      const input = createKeySchema.parse(req.body ?? {});
      if (await agentKeyRepo.countLive(req.user.id) >= MAX_LIVE_KEYS) {
        throw badRequest(`You already have ${MAX_LIVE_KEYS} keys. Revoke one first.`);
      }

      // 32 bytes. Guessing it is not a threat model worth thinking about, which
      // is the only acceptable answer for a key to someone's blood tests.
      const secret = AGENT_PREFIX + randomBytes(32).toString('base64url');
      const key = await agentKeyRepo.create(
        req.user.id, input.label,
        createHash('sha256').update(secret).digest('hex'),
        new Date(Date.now() + input.days * 86_400_000),
      );

      res.status(HttpStatusCode.Created).json({ ok: true, data: { ...key, secret } });
    } catch (e) { next(e); }
  },

  /** Every key that has ever acted as him, live or withdrawn.
   *
   *  The point of this endpoint is that the answer to "what has access to my
   *  record" is a list he can read, not something he has to take on trust. */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await agentKeyRepo.list(req.user.id) });
    } catch (e) { next(e); }
  },

  /** End a key.
   *
   *  Only a signed-in person may do this. A key that can revoke keys can revoke
   *  the ones watching it, and the whole value of this being visible rests on
   *  him being the one holding the switch.
   */
  async revoke(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      if (req.agentKey) throw forbidden('Only you can revoke a key, not an agent');
      const done = await agentKeyRepo.revoke(req.user.id, req.params.id as string);
      res.status(done.count ? HttpStatusCode.NoContent : HttpStatusCode.NotFound).send();
    } catch (e) { next(e); }
  },
};
