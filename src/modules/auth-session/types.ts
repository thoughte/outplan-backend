import { z } from 'zod';
import type { AuthSession } from '../../../generated/prisma/client';

export interface SessionResponse {
  id: string;
  label: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export const createSessionSchema = z.object({
  label: z.string().min(1).max(80).optional(),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

/** The user agent is stored in full for support, but never returned. What the
 *  person needs in a list is "Chrome on macOS", not a 180-character string that
 *  tells them nothing and fingerprints them to anyone who sees the response. */
export function toSessionResponse(s: AuthSession, currentId: string | undefined): SessionResponse {
  return {
    id: s.id,
    label: s.label,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.id === currentId,
  };
}

/** "Chrome on macOS" from a user-agent string. Deliberately coarse: a label is
 *  for recognition, and more detail only helps someone reading the list who
 *  should not be. */
export function labelFromUserAgent(ua: string | undefined): string {
  if (!ua) return 'Unknown device';
  const os =
    /iPhone|iPad/i.test(ua) ? 'iOS' :
    /Android/i.test(ua) ? 'Android' :
    /Mac OS X|Macintosh/i.test(ua) ? 'macOS' :
    /Windows/i.test(ua) ? 'Windows' :
    /Linux/i.test(ua) ? 'Linux' : 'Unknown OS';
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /OPR\//i.test(ua) ? 'Opera' :
    /Chrome\//i.test(ua) ? 'Chrome' :
    /Firefox\//i.test(ua) ? 'Firefox' :
    /Safari\//i.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
}

/** A /24 for IPv4, a /48 for IPv6. Enough to notice "this is somewhere new",
 *  not enough to place someone at an address. */
export function ipPrefix(ip: string | undefined): string | null {
  if (!ip) return null;
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.0/24`;
  const parts = ip.split(':').filter(Boolean);
  return parts.length >= 3 ? `${parts.slice(0, 3).join(':')}::/48` : null;
}
