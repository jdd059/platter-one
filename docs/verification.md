# Verification status

Checked October 21, 2026 on the development Mac. The installed Mixxx bundle reports version 2.5.6. This document separates implementation checks from a physical performance test.

## Passed

- 10 Python tests: precision, signed MIDI chunking, deck routing, hold lease, HTTP assets, pairing/Origin rejection, exclusive ownership, malformed-input release, disconnect release, and server watchdog
- 18 Node tests: angular wrap, offscreen center, Mixxx lifecycle and watchdog, XML dispatch, browser-free pointer ownership, cancellation, deck/layout release, stationary hold, congestion shutdown, forward/reverse release momentum, frame-rate-independent coast distance, catch-on-retouch, inertia toggle, and safe coasting interruption
- JavaScript syntax, Python compilation, shell syntax, and XML parsing
- Native CoreMIDI loopback using a temporary isolated virtual source and receiving MIDI client
- Actual running bridge HTTP/WebSocket input through its CoreMIDI source to a receiving MIDI client: both decks delivered touch, +162 ticks, -162 ticks, hold, and release in order, totaling 18 MIDI messages
- The two installed Mixxx mapping files matched the repository files byte for byte; the existing MIDI Fighter mapping was not edited

The UI event harness uses fake DOM elements and a test WebSocket. The Mixxx script harness uses an engine test double. Neither is a substitute for Safari or an actual loaded Mixxx mapping.

The user subsequently confirmed that physical iPad control of Mixxx works with the initial implementation. The Mixxx log independently showed the Platter One MIDI input opening and its controller script loading. This confirms the initial playable path; it does not verify the new inertia behavior or any latency target.

## Not verified

- New inertia behavior and physical scratch feel, visual layout QA, rotation changes, palm behavior, or multitouch cancellation
- Inertia audio behavior, cut coordination with the MIDI Fighter, release feel, or overall audio latency
- A verified USB/Ethernet route or measured improvement over Wi-Fi
- IAC fallback routing, other operating systems, or other Mixxx versions

An initial desktop page load reached preview status before the user prohibited browser access. Browser work then stopped. There is no completed agent-run screenshot or responsive visual QA. Physical operation of the initial version is based on the user confirmation above; inertia remains awaiting that same physical check.

## Physical acceptance pass

1. Start the bridge, enable the Platter One mapping in Mixxx, and load a scratch sample on the selected deck
2. Start playback using Mixxx or the MIDI Fighter, then open the printed LAN pairing URL in iPad Safari
3. Hold a stationary finger on the record: playback should hold; move clockwise/counterclockwise and verify forward/reverse scratch movement
4. Lift and verify normal playback returns; repeat near the angular seam and across the center dead zone
5. Enable Inertia, flick in each direction, lift, and verify both the record and scratch sound coast and slow down; touch again to catch it, then disable Inertia and verify immediate release
6. Try both layouts and decks, then test viewport rotation and an extra finger while held
7. Close/hide Safari, disconnect Wi-Fi, and stop the bridge while held; verify the deck releases rather than remaining stuck
8. Use the MIDI Fighter for cuts and judge the audible response under the intended audio-buffer and Wi-Fi conditions

If any acceptance check fails, the playable end-to-end goal remains open even when the automated tests pass.
