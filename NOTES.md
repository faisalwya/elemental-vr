# Playtest notes

Newest first. What was played, what Faisal felt, what we decided.

## 2026-11-18 · v10, stations

**Played.** Four stations in a bigger courtyard, travel with the wrist device (fade and snap).

**Faisal:**
- The wrist device was erratic as he looked around; sometimes it appeared right in front of him while his hands were out of sight.
- A spotlight seemed to follow his gaze, mainly when looking at the sky, and only at the other stations, not the practice range.

**Causes (Claude) and fixes, same day, in v10.**
- Spotlight: the sky dome is 90 m out and the camera drew nothing beyond 90 m. At the practice range (the dome's centre) it fit; at the other stations, up to 15 m off centre, the part of the dome you looked toward was cut away, leaving a round patch of plain background that followed your gaze. Now the sky, stars and moon move with you and the draw limit is 300 m.
- Device: out of view, the Quest can keep reporting a hand at a guessed spot, and the device followed it. Now it only shows when you look at your wrist like a watch (back of the hand toward your eyes, gaze within about 37 degrees, held 0.15 s), and its buttons only work while it shows.
- Faisal then asked for the device to stay hidden until needed (the Quest's own left-hand pinch menu is a system gesture, not ours to use). Chosen: tap to wake. A small glowing dot marks the back of the left wrist; tap it with the right index finger (within 4 cm) and the device appears for 4 seconds, longer while you use it, and hides when you travel.
- The circles on the banners faded in and out: they were separate discs, and the rippling cloth moved in front of and behind them. Now painted onto the cloth, and the banners hang far enough off the wall that the ripple never dips into it.
- Found by the emulator check after that change: because you now look down at your wrist to press, you arrived turned about 26 degrees. Arrival now uses where your body faces (your heading smoothed over a second, held while you look at the device).

## 2026-11-18 · v09, jet refined

**Faisal:**
- Jet: acceptable for now; will need more fine tuning later.
- The courtyard could be organised better. Thinking out loud: movement between rooms (a button or a teleport pad) so not everything is crammed into one place.

- Faisal has been walking around his living room while testing every version, not standing in one spot.

**Decided.** v10: one bigger courtyard with stations, travel by a device on the left wrist (back / next, with a small map), quick fade and snap. Beacons saved for goals later. Design for walking around a living-room-sized space, not standing still.

**Was open.** Separate rooms vs stations in one bigger courtyard, and how you travel between them (comfort rule: no smooth artificial movement; a quick fade and snap is fine).

## 2026-11-18 · v08, the courtyard

**Played.** Walled courtyard at dusk with torches, banners, trees, mountains, clouds, fireflies, bats, wind and crickets; new things to burn (hay, lanterns, bell rope, fuse and fireworks, ice, barrels, dry grass). Mechanics as v07.

**Faisal:**
- The courtyard is better, but feels slightly busy. Clarified later: he meant the objects and items felt crowded, not the scenery. (v09 thinned the scenery instead; the crowding is still to fix.)
- The clouds seem to move and change perspective as he looks around.
- Jet needs a better balance between trigger and sensitivity: once a fireball was thrown when he meant to pour, and sometimes he stuck his hand out and it did not pour until he repeated the move.

**Claude's read.**
- Clouds were sprites, which always turn to face the viewer; in a headset that reads as the sky moving with your head.
- The fireball: pushing the hand out to pour is a fast forward move, and the flick read it as a throw.
- The missed pours: v08's still-pose rules (arm 0.38 m out, palm within 45 degrees, fully open, held 0.35 s) were stricter than his natural pose.

**v09 (built the same day).**
- A push is never a throw: a swing that starts in front of the chest and ends palm forward pours at once (no hold). Throws that wind up beside or behind the head still throw, palm forward or not.
- Still pose eased halfway back: arm 0.32 m out, palm within about 50 degrees, open hand 0.08, held 0.25 s.
- The flame swells and brightens while you hold the pose, so you see the pour coming.
- Calmer courtyard: 30 fireflies (was 70), 2 bats (was 4), 5 clouds fixed in the sky (were 9 sprites).

## 2026-11-17 · v07, the flamethrower lab

**Played.** Grab and yank (tighter aiming, near bowls reach-in only), flick, and the new jet: holding a flame, arm out, palm forward pours it out for about 3 s. Straw dummies and the crate wall burn.

**Faisal:**
- Jet: "pretty good". Sometimes it triggered too quickly; it should be less sensitive and need the palm and arm fully extended. It never triggered when it should not have.
- Asked whether the two closest fire pots were deliberately off for pulling from a distance (yes: the v06 aiming fix).
- Wants the world to feel alive rather than an empty room, and more interesting things to use fire on.

**Changed in v07 (same day).** The jet now needs the arm fully out (hand at least 0.38 m in front of the shoulder and 0.45 m from it), the hand fully open (not just relaxed), the palm squarely forward (about 45 degrees, was 53) and the pose held 0.35 s (was 0.2). Once pouring, the arm may ease back a little.

**Decisions.**
- Jet stays: palm forward, held flame is the fuel.
- Next (v08): the world. A place that feels alive and more things that react to fire. This brings the art and world work forward on purpose; the mechanics stay as they are.

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
