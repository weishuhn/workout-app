# Workout Timer

A hands-free, phone-first timer for a fast, whole-body bodyweight circuit. Muscle groups
rotate (push → legs → pull → core, plus optional cardio) so each group recovers while another
works. Two modes:

- **Timed** — exercises run back to back as timed intervals with no rest.
- **Reps** — the screen lists the circuit with rep targets and a countdown time cap; do as many
  rounds as you can.

Beeps and voice cues mean you never need to touch the phone once you press Start.

## Use

Open the site, pick Timed or Reps, check the settings and the generated circuit (Shuffle for a
new one), set your rings to the height shown, and press Start. Add it to your phone's home screen for offline use.

## Develop

No build step and no dependencies.

    python3 -m http.server 8000   # then open http://localhost:8000
    npm test                       # unit tests (Node 20+)
    node scripts/make-icons.mjs    # regenerate icons

The service worker is not registered on localhost (so edits show on reload); open
`http://localhost:8000/?sw` to test offline behaviour.

## Release

Bump `CACHE` in `sw.js`, commit, and push. Hosted with GitHub Pages from the repository root
(Settings → Pages → Deploy from branch → `main` / root).
