import { z } from 'zod';
import type { Correction, Exchange } from '../../../generated/prisma/client';

export const createExchangeSchema = z.object({
  said: z.string().min(1, 'Say something first').max(8000),
  /** The exchange whose reply asked the question this answers. Sent only when
   *  he taps an offered option, never when he types. Ignored if it does not
   *  point at one of his own exchanges. */
  answering: z.string().uuid().optional(),
  /** Set when the message came with a file. The model is told the file exists
   *  and what it is; it never reads numbers out of it. Measurements come from
   *  digest or not at all. */
  attachedFileId: z.string().uuid().optional(),
});
export type CreateExchangeInput = z.infer<typeof createExchangeSchema>;

export const correctSchema = z.object({
  wasWrong: z.string().min(1, 'Say what was wrong').max(4000),
  isRight: z.string().max(4000).optional(),
  domain: z.string().max(80).optional(),
});
export type CorrectInput = z.infer<typeof correctSchema>;

export const listQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().uuid().optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface ExchangeResponse {
  id: string;
  said: string;
  saidAt: string;
  localDay: string;
  parsed: unknown;
  /** Set when this message was answered as part of a later reply, because
   *  several arrived before any answer came back. Not unanswered. */
  coveredById: string | null;
  /** The exchange this one answers, when he tapped an option rather than typed. */
  answeringId: string | null;
  replied: string | null;
  /** { messages: string[], question?: { text, options[] } } - how to SHOW it. */
  replyParts: unknown;
  repliedAt: string | null;
  model: string | null;
  promptVersion: string | null;
  corrections: Array<{ id: string; wasWrong: string; isRight: string | null; createdAt: string }>;
}

export function toExchangeResponse(
  e: Exchange & { corrections?: Correction[] },
): ExchangeResponse {
  return {
    id: e.id,
    said: e.said,
    saidAt: e.saidAt.toISOString(),
    localDay: e.localDay,
    parsed: e.parsed,
    coveredById: e.coveredById,
    answeringId: e.answeringId,
    replied: e.replied,
    replyParts: e.replyParts,
    repliedAt: e.repliedAt ? e.repliedAt.toISOString() : null,
    model: e.model,
    promptVersion: e.promptVersion,
    // Corrections are returned WITH the exchange, never separately. The wrong
    // answer and the correction to it are one artefact; showing either alone is
    // how a corrected answer gets quoted back as though it still stood.
    corrections: (e.corrections ?? []).map((c) => ({
      id: c.id,
      wasWrong: c.wasWrong,
      isRight: c.isRight,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}
