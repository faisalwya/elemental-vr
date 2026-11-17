# Elemental Proving Ground VR

> **Control the elements with your hands, shape the world around you.**

A standing-play VR game for Meta Quest, built for the web (WebXR, three.js). No install: open the link in the Quest browser and press Enter VR.

**Play:** https://faisalwya.github.io/elemental-vr/ (opens the latest version). On a computer the page plays itself as a preview.

## Pillars

1. **Mechanics and physics.** What your hands do with each element (take, throw, and later more), and how the world reacts: burning, spreading, toppling, melting, mixing.
2. **Look and feel.** The art style, plus everything that makes an action feel good: release bursts, trails, glow, sound, vibration. "Invisible fireballs" and "choppy pick-up" were problems in this pillar.

**Constraint on everything:** comfort and performance. Smooth frame rate on the Quest (72 Hz or better), standing play, no artificial movement, nothing that causes motion sickness.

**Parked for later:** goals and progression (why you play), and the wider world beyond one yard.

## Roadmap

1. **Core moves with fire** (now). One mechanic at a time, each in a bare lab until it feels right:
   1. Throwing (v05: hold-and-release vs flick, aim help off)
   2. Taking fire (reaching in vs pulling from a distance)
   3. Charging a throw
   4. Jet, only if it still earns its place
2. **Water** as the second element, to check the moves carry over.
3. **Combining elements** (steam and beyond).
4. **Art direction pass.** Before then, only small art tests that do not touch the mechanics.
5. **Goals and the wider world.**

## Versions

Every version stays playable at `/vNN/`. The newest is the one being worked on; older ones are never edited.

| Version | What it was | Verdict |
|---|---|---|
| [v01](https://faisalwya.github.io/elemental-vr/v01/) | Water and fire. Squeeze to grab, swing and let go to throw, mix to steam, light five lanterns. | Impressed, no noticeable bugs. |
| [v02](https://faisalwya.github.io/elemental-vr/v02/) | Fire only. Carry on open palm, push/fist/pinch/palm-down gestures, physics fire yard with seven targets. | Pick-up and drop choppy; thrown fire invisible (bug). |
| [v03](https://faisalwya.github.io/elemental-vr/v03/) | Reach to pull fire, palm-down drop removed, fire visible in flight. | Better; pull and throw still need work. |
| [v04](https://faisalwya.github.io/elemental-vr/v04/) | Lock-on pull, swing throw, tuning board, practice discs. | Not enjoyable; changes not noticeable. See NOTES.md. |

## Repo

```
index.html     opens the latest version
vNN/           one folder per version: index.html + src/
vendor/        three.js r187 and cannon-es 0.20, shared by all versions
tests/         unit tests (node) and a headless page check (playwright)
NOTES.md       dated playtest log and decisions
CLAUDE.md      how Claude works in this repo
```

No build step: plain ES modules, served as they are by GitHub Pages from `main`.

## Testing

- `node tests/gestures.test.mjs` and `node tests/fire.test.mjs`: game logic, no browser.
- `python3 tests/page_check.py v04 60`: loads a version in headless Chrome, lets the demo play, reports events and page errors.
- Immersive Web Emulator (Chrome extension) to try a version on the laptop without the headset. Its AI agent bridge lets a local coding agent drive the emulated headset.
- The headset is the only judge of feel.
