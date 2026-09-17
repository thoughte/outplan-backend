# Memory — backend scope

Index loaded at session start. One line per memory, no content here.

## Read before anything else

| File | Why |
|---|---|
| `/Users/work/Claude/Health/app/claude-rules-v2/.claude/prd.md` | the master PRD and the **eight non-negotiables**. Read-only from here |
| `/Users/work/Claude/Health/plans/from-health.md` | findings from the owner's real use that imply a change here |
| `/Users/work/Claude/Health/plans/silent-plans-spec.md` | silent-plans engine, full spec |
| `/Users/work/Claude/Health/plans/reading-engine-spec.md` | reading engine, full spec |
| `/Users/work/Claude/Health/app/outplan/` | the working reference implementation, 127 tests |

Absolute paths on purpose: relative ones are counted from the wrong place at least as often
as they are counted from the right one, and a pointer that silently resolves to nothing is
worse than no pointer.

## Ownership

**This session owns `app/claude-rules-v2/backend/`.** Everything above it is read-only. If something outside needs
to change, do not edit it — surface a *TODO for parent-level session* at end of turn, per
`CLAUDE.md`.

**The health session** (`/Users/work/Claude/Health`) owns the owner's body, the daily log, and
any fix provoked by his own use of the product. It writes `from-health.md`; this session reads it.

<!-- memories below, newest first -->
