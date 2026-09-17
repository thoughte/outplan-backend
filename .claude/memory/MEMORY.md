# Memory — backend

Loaded alongside `../.claude/memory/MEMORY.md`, which carries the shared pointers and the
master PRD. Read that too; this file is backend-only.

## Ownership

This session owns `backend/`. Everything above it is read-only. If something outside needs to
change, surface a *TODO for parent-level session* at end of turn — do not edit it.

<!-- backend memories below, newest first -->
