# Planned, not built

Things decided but deliberately not started. Each says enough that whoever picks
it up does not have to re-derive the thinking.

---

## Family goals and a shared plan

Kunal, 19 Sep 2026: a family of four all using outplan should be able to create a
family and share one meal plan. "Or maybe more than a meal, anything that is very
difficult unique per person."

**Why it is not just a nicety.** A household cooks one dinner. Nobody makes four
different dals, so a plan that assumes every person eats to their own target is
a plan that gets ignored at the only moment it matters. The same is true of
anything the house does together: when dinner is served, whether there is fruit
in the bowl, what time the kitchen closes.

**The shape.**

- A `Household` with members. Joining is by invitation and leaving is one action,
  because a family is not a permanent fact.
- A goal or plan item can belong to the household rather than to a person. The
  existing `PlanItem.source` already has `intervention | manual`; a third,
  `household`, is the natural place for this.
- One shared item, several people's constraints. His uric acid at 7.6 wants less
  red meat and less alcohol; someone else in the same house may be low on iron
  and want the opposite. The interesting engineering is not sharing the plan, it
  is **surfacing the conflict** rather than silently optimising for whoever set
  it up.
- Ticking a shared item is per person. Dinner being cooked is not the same as
  everyone having eaten it.

**THE CONSTRAINT THAT MATTERS MOST.** Sharing a meal plan must never share a
health record. Members see the shared plan and their own record, never each
other's numbers, symptoms, medicines or conversation. This is not a
configuration option to be defaulted sensibly; it is the whole basis on which a
household would agree to use one app.

Two specifics that follow from it, and that are easy to get wrong:

1. A shared item can be justified by a member's private data, and the
   justification must not leak. "Less salt this week" is fine. "Less salt this
   week because Papa's blood pressure is 158/96" is a disclosure that person
   never agreed to. The reason belongs to the member; only the item is shared.
2. The conflict surfacing above has the same problem. Telling the household that
   two members' targets disagree is useful; naming whose target and what it is,
   is not. Conflicts should be resolvable without publishing anyone's record.

**Related, already built:** goals decompose into a tree and a household goal
would sit above individual ones; `PlanItem` already carries a source and a
per-item done state; `Observation` already links back to the message it came
from, which is how a shared meal would become per-person intake.
