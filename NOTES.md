# Playtest notes

Newest first. What was played, what Faisal felt, what we decided.

## 2026-11-17 · v06, the pulling lab

**Played.** No flame appears on its own. Reach into a near bowl, or pull from fires at 2.5, 4.5 and 7 m. Style A, grab and yank (open hand toward the fire until it glows, close to grab, yank the fist back) vs style B, two-finger draw (point index and middle at the fire, draw the hand back). Throw is v05's flick.

**Faisal:** "A is definitely the winner."

**Decisions.**
- Pull = A, grab and yank. B (two-finger draw) is cut.
- Throw = v05's flick, kept.
- So the core loop so far: reach, grab, yank, flick.

**Follow-up answers.**
- Aiming was mostly clear, but a few times he meant one fire and it pulled from another. Likely causes (Claude): the aim is the shoulder-to-hand line, not where the palm or eyes point; the big near bowls have wide aim zones and can steal a low aim; and a fire seen up to 0.25 s before closing can still be grabbed. Fix in the next version: near bowls are reach-in only, a narrower aim zone, and grab only the fire that is glowing at the moment the hand closes.
- Keep reaching into a near bowl to take a flame.
- Faisal's idea for next: flamethrower hands, open palm forward.

## 2026-11-17 · v05, the throwing lab

**Played.** Flame appears in each hand. Style A, hold and release (close, swing, open) vs style B, flick (open hand, leaves at the fastest point of the swing). Wrist button to switch. Aim help off. Targets at 3, 6, 9 m and a crate wall.

**Faisal:**
- Prefers B: more fluid, movements felt more natural, enjoyed hitting the targets and knocking the boxes.
- Likes A's deliberateness: felt more in control. But it became repetitive.
- In A he quickly and intuitively started extending index and middle finger as he let go. It worked well and felt natural.
- Bug: 3 or 4 times, only on the right hand, the flame hovered in place while the hand was still tracked and moving.
- When hands were out of sight they behaved oddly and fired sporadically, mainly in B.

**Bugs found and fixed (v05, same day).**
- Right flame freezing: when a hand drops out and comes back, three.js can put it in the other input slot. If the right hand sat in slot 0 with the left out of view, the empty slot 1 defaulted to "right" and overwrote the real right hand with "not tracked". Only the right hand could suffer. Reproduced and fixed with the emulator check.
- Sporadic throws out of sight, two guards: a throw only leaves from a hand in front of you (within about 75 degrees of where you face), and a jump faster than 15 m/s between two frames counts as a tracking glitch, not a swing. Also: switching from hands to controllers no longer reads as a flick.
- New check: `node tests/xr_check.mjs v05` plays the lab in an emulated Quest 3 (hands and controllers) in headless Chrome.

**Claude's read.**
- B is the throw. It is the one that felt like throwing and was fun on its own.
- A's control and the two-finger release are worth keeping as ideas, not as a second throw. Closing the hand is a deliberate act, which fits a later mechanic (charging, or a precise aimed throw) better than the basic throw.
- The out-of-sight firing may have been partly the slot bug (it also made the right hand look "lost" mid-swing, which threw). Check whether it is gone.

**Open questions.**
- Does B still feel as good with the fixes, and is the sporadic firing gone?
- Is the 75 degree "in front of you" limit ever blocking a throw you meant?

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
