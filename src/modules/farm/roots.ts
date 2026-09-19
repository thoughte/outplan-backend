import { prisma } from '../../lib/prisma';

/** What the record is actually made of.
 *
 *  Not the files. The Records screen is the files, and a browsable list of
 *  documents with soil drawn around it would be the same screen twice. These are
 *  the THINGS INSIDE the documents: how many markers have ever been measured,
 *  how many of them have been measured more than once, what is known about
 *  symptoms and medicines, and how far back any of it goes.
 *
 *  COMPLETENESS, NEVER RESULTS. A marker sitting at a frightening value grows
 *  exactly the same root as a good one. No value appears here, nothing is ranked
 *  by concern, and nothing is coloured by whether a number is bad. That is the
 *  rule that makes uploading safe, and it is what lets this be shown to someone
 *  who does not want to look at their results.
 */

export interface Root {
  key: string;
  name: string;
  /** How much of this there is. The only number on the surface. */
  count: number;
  /** Said plainly, and about coverage rather than content. */
  note: string;
  /** Where it came from, when that is knowable and different. */
  from?: { documents: number; conversation: number };
}

export interface Roots {
  roots: Root[];
  /** Oldest and newest dated thing in the record, as ISO days. Null when
   *  nothing is dated, which is a real state and not an error. */
  span: { from: string | null; to: string | null };
  /** Markers with more than one reading. A second reading is what turns a
   *  number into a direction, and this is the honest measure of how much the
   *  record can actually say. */
  repeated: number;
}

export async function rootsFor(userId: string): Promise<Roots> {
  const [markers, repeatedRows, symptoms, meds, genes, obs, fromFiles, oldest, newest] = await Promise.all([
    prisma.measurement.findMany({ where: { userId }, distinct: ['variable'], select: { variable: true } }),
    prisma.measurement.groupBy({ by: ['variable'], where: { userId }, _count: { _all: true } }),
    prisma.symptom.count({ where: { userId } }),
    prisma.intervention.count({ where: { userId } }),
    prisma.geneticMarker.count({ where: { userId } }),
    prisma.observation.count({ where: { userId } }),
    prisma.measurement.count({ where: { userId, sourceFileId: { not: null } } }),
    prisma.measurement.findFirst({
      where: { userId, collectedOn: { not: undefined } },
      orderBy: { collectedOn: 'asc' }, select: { collectedOn: true },
    }),
    prisma.measurement.findFirst({
      where: { userId, collectedOn: { not: undefined } },
      orderBy: { collectedOn: 'desc' }, select: { collectedOn: true },
    }),
  ]);

  const total = repeatedRows.reduce((n, r) => n + r._count._all, 0);
  const repeated = repeatedRows.filter((r) => r._count._all > 1).length;

  const roots: Root[] = [
    {
      key: 'markers',
      name: markers.length === 1 ? 'marker measured' : 'markers measured',
      count: markers.length,
      note: repeated
        ? `${repeated} of them more than once, which is what turns a number into a direction`
        : 'one reading each so far, so nothing can show a direction yet',
      // The split is honest only for measurements, where sourceFileId records it.
      from: { documents: fromFiles, conversation: Math.max(0, total - fromFiles) },
    },
    {
      key: 'genetics',
      name: genes === 1 ? 'genetic marker' : 'genetic markers',
      count: genes,
      note: 'read once and kept. Nothing here changes, which is why it is never asked for again',
    },
    {
      key: 'symptoms',
      name: symptoms === 1 ? 'symptom written up' : 'symptoms written up',
      count: symptoms,
      note: 'what was said, when, and what it turned out to be',
    },
    {
      key: 'medicines',
      name: meds === 1 ? 'medicine on record' : 'medicines on record',
      count: meds,
      note: 'with the reason each was started, which is what a goal to be free of it is built from',
    },
    {
      key: 'said',
      name: obs === 1 ? 'thing logged from talking' : 'things logged from talking',
      count: obs,
      note: 'meals, water, sleep, doses. Each one traces back to the message it came from',
    },
  ].filter((r) => r.count > 0);

  return {
    roots,
    span: {
      from: oldest?.collectedOn ? oldest.collectedOn.toISOString().slice(0, 10) : null,
      to: newest?.collectedOn ? newest.collectedOn.toISOString().slice(0, 10) : null,
    },
    repeated,
  };
}
