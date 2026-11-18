# Elemental Proving Ground VR

> **Control the elements with your hands, shape the world around you.**

A standing-play VR game for Meta Quest, built for the web (WebXR, three.js). No install: open the link in the Quest browser and press Enter VR.

**Play:** https://faisalwya.github.io/elemental-vr/ (opens the latest version). On a computer the page plays itself as a preview.

## Pillars

1. **Mechanics and physics.** What your hands do with each element (take, throw, and later more), and how the world reacts: burning, spreading, toppling, melting, mixing.
2. **Look and feel.** The art style, plus everything that makes an action feel good: release bursts, trails, glow, sound, vibration. "Invisible fireballs" and "choppy pick-up" were problems in this pillar.

**Constraint on everything:** comfort and performance. Smooth frame rate on the Quest (72 Hz or better), room-scale play (walking around a living-room-sized space; Faisal plays this way), no smooth artificial movement (travel is a quick fade and snap), nothing that causes motion sickness.

**Parked for later:** goals and progression (why you play), and the wider world beyond one yard.

## Roadmap

1. **Core moves with fire** (now). One mechanic at a time, each in a bare lab until it feels right:
   1. Throwing (v05: hold-and-release vs flick, aim help off)
   2. Taking fire (v06: reach in, plus grab-and-yank vs two-finger draw from a distance)
   3. Jet (v07: palm forward pours the held flame; Faisal's idea, tested before charging)
   4. Charging a throw
2. **Water** as the second element, to check the moves carry over.
3. **Combining elements** (steam and beyond).
4. **Art direction pass.** Started early in v08 at Faisal's request (a courtyard that feels alive, more things to burn), without touching the mechanics.
5. **Goals and the wider world.**

## Versions

Every version stays playable at `/vNN/`. The newest is the one being worked on; older ones are never edited.

| Version | What it was | Verdict |
|---|---|---|
| [v01](https://faisalwya.github.io/elemental-vr/v01/) | Water and fire. Squeeze to grab, swing and let go to throw, mix to steam, light five lanterns. | Impressed, no noticeable bugs. |
| [v02](https://faisalwya.github.io/elemental-vr/v02/) | Fire only. Carry on open palm, push/fist/pinch/palm-down gestures, physics fire yard with seven targets. | Pick-up and drop choppy; thrown fire invisible (bug). |
| [v03](https://faisalwya.github.io/elemental-vr/v03/) | Reach to pull fire, palm-down drop removed, fire visible in flight. | Better; pull and throw still need work. |
| [v04](https://faisalwya.github.io/elemental-vr/v04/) | Lock-on pull, swing throw, tuning board, practice discs. | Not enjoyable; changes not noticeable. See NOTES.md. |
| [v05](https://faisalwya.github.io/elemental-vr/v05/) | Throwing lab. Flame appears in hand; style A hold and release vs B flick, wrist button to switch, aim help off. | B felt natural and fun; A more controlled but repetitive. Two tracking bugs fixed. |
| [v06](https://faisalwya.github.io/elemental-vr/v06/) | Pulling lab. Reach into near bowls, or pull from 2.5 to 7 m: A grab and yank vs B two-finger draw. Throw is v05's flick. | A, grab and yank, clearly won. |
| [v07](https://faisalwya.github.io/elemental-vr/v07/) | Flamethrower lab. Holding a flame: arm out, palm forward pours it as a jet (about 3 s). Straw dummies and crates burn. Grab and yank with tighter aiming. | Jet "pretty good"; made less trigger-happy (arm fully out, hand fully open). |
| [v08](https://faisalwya.github.io/elemental-vr/v08/) | The courtyard. Walled courtyard at dusk (torches, banners, trees, mountains, clouds, fireflies, bats, wind and crickets). New things to burn: hay, lanterns, a bell on a rope, fuse to fireworks, ice with a flame inside, barrels, dry grass. Mechanics unchanged. | Better, slightly busy; clouds moved with the head; jet threw a fireball once and sometimes missed. |
| [v09](https://faisalwya.github.io/elemental-vr/v09/) | Jet refined: a push from in front pours at once and never throws; still pose eased; flame swells before pouring. Calmer courtyard, clouds fixed in the sky. | Jet acceptable for now. Objects still crowded. |
| [v10](https://faisalwya.github.io/elemental-vr/v10/) | Four stations in a bigger courtyard (practice range, burn yard, machine corner, frozen corner), each about 2 x 2 m with its own reach-in bowl. Wrist device with a map to travel (fade and snap). Mechanics unchanged. | Device popped up out of view and the sky was cut off away from the centre: fixed (tap to wake, sky follows you). |
| [v11](https://faisalwya.github.io/elemental-vr/v11/) | Lock-on comparison: aim A (shoulder-to-hand line) vs aim B (the Quest's pointing ray), switched on the wrist device; visible aim beam, sticky selection, pull speed shown above the hand. | No felt difference; B slightly better. Selection mostly fine; the yank needed repeats. Wrist device unreliable (hand-over-hand tracking). |
| [v12](https://faisalwya.github.io/elemental-vr/v12/) | Yank A (quick tug) vs B (pull back 15 cm), grab-and-yank in one motion counts; aim is the headset ray; the fire leans toward you and sparks tether your grab (beam only in debug); floor pads replace the wrist device; a post with yank and debug buttons. | Waiting for playtest. |

## Repo

```
index.html     opens the latest version
vNN/           one folder per version: index.html + src/ (v08 adds src/scenery.js for the surroundings)
vendor/        three.js r187 and cannon-es 0.20, shared by all versions
tests/         unit tests (node) and a headless page check (playwright)
NOTES.md       dated playtest log and decisions
CLAUDE.md      how Claude works in this repo
```

No build step: plain ES modules, served as they are by GitHub Pages from `main`.

## Testing

- `node tests/gestures.test.mjs`, `node tests/fire.test.mjs` (v04) and `node tests/throw.test.mjs` (v05), `node tests/pull.test.mjs` (v06), `node tests/jet.test.mjs` (v07, v08), `node tests/push.test.mjs` (v09), `node tests/lock.test.mjs` (v11), `node tests/yank.test.mjs` (v12): game logic, no browser.
- `python3 tests/page_check.py v12 60`: loads a version in headless Chrome, lets the demo play, reports events and page errors.
- `node tests/xr_check.mjs v12` (or v05 to v11): enters VR in an emulated Quest 3 (the `iwer` package, installed on first run) with emulated hands and controllers, plays the version's styles and the wrist button, and saves screenshots from eye height. Checks function, not feel.
- Immersive Web Emulator (Chrome extension) to try a version on the laptop without the headset. Its AI agent bridge lets a local coding agent drive the emulated headset.
- Performance budget: v08 draws about 175 objects per eye (v10 about 157) at standing height (measured with `renderer.info` in headless Chrome). If the Quest drops frames, cut torches and overhead lanterns first.
- The headset is the only judge of feel.
