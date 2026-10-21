# Platter One

Keep this a small input-only experiment: plain browser JavaScript, Python bridge, Mixxx mapping
No browser audio, mixer, cue, sampler, Electron, or frontend build system

Validate changes with `.venv/bin/python -m unittest discover -s tests -v` and `node --test tests/*.test.mjs`
Use `--dry-run` for network tests; MIDI output requires an explicit normal launch
Keep mapping resolution and bridge resolution consistent (2048 ticks/revolution)
Keep the existing MIDI Fighter mapping independent
Do not claim audible scratch quality without a physical Safari/Mixxx test
