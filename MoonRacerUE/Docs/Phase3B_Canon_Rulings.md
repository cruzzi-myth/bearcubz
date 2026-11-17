# Phase 3B — canon rulings recorded at P5B-1 (RECORDED, NOT IMPLEMENTED)

These rulings were stated in the P5B-1 authorization. They are recorded here so later stages can rely on them. **Nothing in the code, content or onboarding flow implements them yet**, and no missing detail has been invented.

| # | Ruling | Status |
|---|---|---|
| 1 | Canonical tavern display name: **Last Orbit Tavern** | Display name settled (resolves the name part of blocker B-02). The canonical **location id** is still unknown (`core-tavern` remains unverified). |
| 2 | **Tavian Rell is the bartender.** | Identity settled: Tavian and the bartender are ONE character (merges B-03 and B-04). His NPC **record** (voice, art, placement, dialogue) is still missing. The art file `MIQ-3LLE_NEBULA_LOUNGE_BARTENDER` is still unconfirmed as him. |
| 3 | Tavian's introductory artifact mission involves **Aria Vega**. | Subject settled. The mission definition (objectives, trigger, completion, reward), the artifact, and Aria Vega's character record are all still missing (B-05 open). Nothing here is authored. |
| 4 | The Galactic Space Station tavern encounter **precedes** the departure-terminal Passport scan and transit to the Core. | Narrative order settled. Supersedes the order implemented in the 11-state machine (see `Phase3B_P5A_Canon_Discrepancy.md`). |
| 5 | Core manifest authority **remains unresolved**. | Open (B-01). Blocks every Core location/NPC/quest id registry. |
| 6 | The existing 11-state onboarding machine **requires a separately approved redesign and save migration**. | Not authorized. The machine, its tests and its save format are unchanged. |

## Updated blocker view
| Blocker | Before | Now |
|---|---|---|
| B-01 Core manifest authority | open | **open** |
| B-02 tavern identity | name + id open | name = *Last Orbit Tavern*; **location id open** |
| B-03 Tavian record / B-04 bartender | two NPCs | **one NPC (Tavian Rell)**; record + dialogue open |
| B-05 first mission | unknown | subject known (artifact, Aria Vega); **spec open** |
| B-06 arrival cinematic | unknown | unknown (the order now puts transit-to-Core after the Passport scan; content still open) |
| B-07 Core 3D environment | open | open (and a Galactic Space Station environment is now also implied) |
| B-08 / B-09 | open | open |

## What this implies for later work (design notes only)
- The onboarding redesign will need a station location/state before the Passport scan state; the single Tavian/bartender NPC may collapse today's `TAVIAN_DIALOGUE` + `BARTENDER_HANDOFF` into one conversation state. That is a design question for the approved redesign, not something decided here.
- The P5A/P5B narrative systems are independent of the order: conversations, missions and the registration layer are data-driven and need no change.
- The existing progress save version will need a bump and a migration that does not reset progress; the content-version stamp added in P5A is the detection mechanism.
- Passport interaction stays offline-guest (D-1); the in-fiction scan does not by itself authorize live Passport integration.
