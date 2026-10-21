# Platter One

A touch scratch platter for Mixxx on macOS. Open it in Safari on an iPad or iPhone; the Mac does all audio work.

This is a small experimental controller, not a browser DJ app. It provides a full record and a larger, cropped half record. Rotation follows your finger around the record's actual center. One finger owns the platter until release; additional touches are ignored. A small center dead zone avoids unstable angles.

## Quick start

Requires macOS, Python 3.10 or newer, and Mixxx 2.5. A source install of python-rtmidi may need Apple's Command Line Tools. The local verification environment was Apple Silicon macOS, Python 3.14, and installed Mixxx 2.5.6.

From this repository:

```sh
./scripts/setup.sh
python3 scripts/install-mapping.py
./Start\ Platter\ One.command
```

1. Keep the bridge running in Terminal. It creates a virtual MIDI source named **Platter One** and prints pairing URLs
2. In Mixxx, open **Preferences > Controllers > Platter One**, choose the **Platter One** mapping, check **Enabled**, and apply. Restart Mixxx if the new mapping or port is not listed
3. Keep your MIDI Fighter configured independently. Platter One sends no playback, crossfader, cuts, cue, or sampler commands
4. Put the Mac and iPad on the same trusted LAN. Open the Mac's printed LAN pairing URL in iPad Safari. Use its LAN address, not `127.0.0.1`. Allow local network/firewall access if prompted
5. Load a scratch sample and start playback in Mixxx or with your hardware. Select deck 01 or 02 in Safari, touch the record to hold it, rotate to scratch, and lift to release

The installer detects an existing standard macOS Mixxx profile, adds only its two files, and refuses to replace different existing files. Use `--check` to inspect without writing, or `--destination /path/to/controllers` if you have multiple profiles. It does not edit Mixxx preferences or the MIDI Fighter mapping.

You can double-click **Start Platter One.command** after setup. Stop the bridge with Control-C. The port exists only while the bridge runs. Mapping activation and physical scratch feel still require a human check in Mixxx and Safari.

## Layouts and feel

- **Full platter**: the complete vinyl record fits the available touch area
- **Half platter**: an oversized record extends below and beyond the screen, with its real center used for angle calculations
- **Sensitivity**: 1× maps one finger revolution to one record revolution at 33⅓ RPM; 0.5× to 2× adjusts movement gain
- Layout, deck, sensitivity, and viewport changes release the platter before changing geometry or routing

The label follows finger movement only. It is not synchronized to track playback. The displayed round-trip time measures the browser/bridge connection, not total audio latency. **Bridge online · Mixxx unverified** deliberately does not claim the Mixxx mapping is enabled or audio is audible.

## Architecture

Safari Pointer Events → same-origin WebSocket → Python aiohttp bridge → python-rtmidi CoreMIDI virtual source → Mixxx MIDI XML binding → Mixxx controller script → audio engine

There is no frontend build, Web MIDI requirement, browser audio, remote service, or Electron wrapper. The bridge has two direct dependencies. `requirements.lock` pins the tested dependency set; `requirements.txt` states the compatible direct dependency ranges. See [research and architecture](docs/architecture.md) and the [wire protocol](docs/protocol.md).

macOS CoreMIDI can publish a virtual MIDI source directly, so **IAC is not required**. An existing IAC bus is an optional alternative: launch with `--midi-port` followed by the exact destination name shown by `--list-midi-ports`, then select that bus's Platter One mapping in Mixxx. Do not route the same events through both paths.

## Connection and recovery

The bridge listens on all local interfaces on port 8765 by default. Run with `--host 127.0.0.1` for Mac-only access or `--port` to change the port. `--dry-run` serves the real interface without creating MIDI ports and clearly labels preview mode.

Each launch prints a fresh random pairing token in the URL fragment. The page moves it to per-tab session storage and includes it during the WebSocket handshake. The bridge checks that token and the exact Origin, accepts one connected controller at a time, limits frame size, and exposes only the frontend assets. Keep the pairing URL private. HTTP/WebSocket traffic is unencrypted; use a trusted LAN and do not forward this port to the internet.

A held finger sends a heartbeat every 100 ms. Missing input releases the bridge after 500 ms, and the mapping has an independent 750 ms watchdog if the bridge dies. Graceful stop, disconnect, malformed input, pointer cancellation, focus loss, and page hiding also release. Browser congestion/stall detection closes the connection rather than intentionally replaying a backlog. These are best-effort guards, not a hard real-time guarantee.

If a connection stalls, lift and touch again after it recovers. A second device is refused until the first disconnects. To transfer devices, close the first page. If Safari cannot connect, check the printed URL/token, same-LAN access, guest Wi-Fi client isolation, VPN, macOS firewall, and local network permissions. Reloading a pairing URL from an older bridge launch will not work.

For rough scratching, try a better Wi-Fi connection and lower the Mixxx audio buffer while monitoring dropouts. Physical Safari touch behavior, network jitter, audible response, and your MIDI Fighter cuts must be judged on your devices. No latency or scratch-quality target is claimed from automated tests.

## Development and verification

```sh
.venv/bin/python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python3 scripts/install-mapping.py --check
```

Tests cover signed rotation, seam crossing, the offscreen center, precision retention, deck routing, pairing, exclusive ownership, malformed input, disconnect release, and both watchdogs. The Mixxx script is exercised against an engine test double; that does not prove the audio engine was driven. Native CoreMIDI loopback was separately checked on macOS. See [verification status](docs/verification.md) for exact boundaries.

MIT licensed. The implementation is original; reference projects and their licenses are identified in the research notes.
