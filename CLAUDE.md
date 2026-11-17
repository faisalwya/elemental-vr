# Working on Elemental Proving Ground VR

Read `README.md` (north star, pillars, roadmap) and the top entry of `NOTES.md` (latest playtest and what is next) before doing anything.

## How we work

- **One mechanic at a time.** Change one thing per version, by a large enough step that Faisal can feel the difference in the headset. Small tweaks across many systems taught us nothing (see v04 in NOTES.md).
- **Cut before tuning.** If a mechanic does not feel good on its own, propose dropping it rather than adding settings.
- **Hands first.** Design for hand tracking; keep controllers working as a diagnostic.
- **Faisal judges feel, the agent checks function.** Faisal is the only judge of whether something is fun or feels like controlling an element. Agent checks tell us whether it works and give numbers.

## Versions

- Each version is a folder `vNN/` (index.html plus `src/`). Never edit an older version; it is a reference Faisal can go back to.
- To start a new version: copy the latest folder to the next number, update its title, eyebrow and "Earlier drafts" links, and point the root `index.html` at it.
- Shared libraries live in `vendor/` (three.js r187, cannon-es 0.20). Versions import them through an importmap: `"three": "../vendor/three.module.js"`.
- No build step. Plain ES modules. Keep the file count low; prefer extending an existing file over adding one.

## Checks before pushing

- Run `node tests/*.test.mjs` and `python3 tests/page_check.py vNN 60`. When logic changes, add a test for it.
- Checks inform, they do not block. If something fails, push anyway when Faisal wants to play it, and say plainly what is broken. If Faisal asks for a rough build, skip checks and say so.
- If the Immersive Web Emulator bridge (MCP server `iwer`) is available in a local session, use it to enter VR and try the new mechanic before handing over.

## Deploying

- GitHub Pages serves `main` from the repo root at https://faisalwya.github.io/elemental-vr/. Pushing to `main` deploys; it can take a minute to appear.
- After each push, tell Faisal the link, what changed in one or two lines, and the one or two questions this version should answer.
- Add a dated entry to the top of `NOTES.md` when Faisal reports back.

## Lessons from the code so far

- Keep the number of lights constant (toggle intensity, never add or remove lights) or three.js recompiles shaders mid-game and stutters.
- Measure hand velocity against game time (the summed frame step), not wall-clock time, or slow frames make swings read too slow.
- Anything simulated must also be drawn. v02 shipped invisible fireballs.
- Aim help hides differences between mechanics. Keep it off while comparing.
- Hand-tracking gesture thresholds were set on made-up poses; trust Faisal's report over the numbers.

## Writing for Faisal

- No em dashes in anything written for him.
- Dense and structured: short sections, lists, no recap of steps.
