# Playtest notes

Newest first. What was played, what Faisal felt, what we decided.

## 2026-11-17 · v01 to v04, and a reset

**Background.** The game started as a mobile 3rd-person sandbox (Elemental Proving Ground, Lantern Courtyard) and a mobile format lab (Grain, Rooms, Spirit). The element rules (fire spreads, wet things refuse to burn, water plus fire is steam) held up across all of them. Faisal has a Quest 3, so we tried VR.

**v01 · water and fire.** Squeeze or pinch to grab from a pool or brazier, swing and let go to throw, two hands together for steam, light five lanterns. Faisal: "quite impressed", no noticeable bugs, lots of ideas.

**v02 · fire only, gestures and a yard.** Flame carried on an open palm; push to throw, fist to charge, pinch for a jet, palm down to drop. Physics yard with seven targets. Faisal:
- Picking up and dropping (palm up and down) choppy and unreliable.
- Wanted: extend the hand to pull fire; drop by throwing it away.
- Could not see thrown fire. Cause: a bug, shots were simulated but never drawn.

**v03 · reach to pull.** Better. Pull needed calibrating: more deliberate and satisfying, less sensitive, still intuitive. Open/empty wrist labels not needed. Throwing still awkward and not natural.

**v04 · calibration build.** Lock-on pull (glow and thread, then close hand or yank), swing throw released at peak speed, aim leaning toward gaze, tuning board with sliders, practice discs at 2, 4, 7 m. Faisal: did not enjoy it, could not tell the pull styles apart, noticed no difference in throwing. "We strayed off."

**What went wrong (Claude's read).**
- Too many changes at once, each too small to feel.
- Aim help at 85% steered almost any throw onto a target, so every throwing style felt the same.
- Sliders are no help when the base mechanic does not feel good yet.
- With the flame on an open palm there is no moment where you decide to let go. That is probably why throwing never felt like throwing. v01's squeeze, swing, open-to-release did.

**Decisions.**
- North star: "Control the elements with your hands, shape the world around you."
- Two pillars (mechanics and physics; look and feel) plus comfort and performance as a constraint.
- One mechanic at a time, in a bare lab. If it does not feel good on its own, cut it rather than tune it.
- Dropped for now: pull from a distance, yank, jet, charge, tuning board.
- Hands first. Controllers used as a diagnostic: if throwing feels good on controllers but not with hands, the problem is tracking, not the design.
- Agent checks inform, they do not block. Faisal can always ask for a rough untested build.

**Next: v05, the throwing lab.**
- Flame appears in the hand, another after each throw. No taking, charging, jet, sliders or checklist.
- Big targets at a few distances and a wall of stacked crates to knock down.
- Aim help off, so each throw goes where the hand sent it.
- Clear release moment (burst, whoosh) and a long trail on every throw.
- Two styles, switched from a wrist button:
  - **A, hold and release:** close the hand around the flame, swing, open to let go (like v01).
  - **B, flick:** flame on an open palm, leaves at the fastest point of the swing (like v04).
- Optional: a recording mode that saves 20 real throws, so an agent can replay Faisal's own motion against later versions.
- Questions for the playtest: which style felt like throwing? Do throws go where you meant?
