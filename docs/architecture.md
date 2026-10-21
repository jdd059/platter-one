# Research and architecture

Source review: October 21, 2026. The installed application was Mixxx 2.5.6. The manual's `latest` URL resolved to the 2.5 documentation at review time.

## Supported Mixxx boundary

The [advanced topics manual](https://manual.mixxx.org/2.5/en/chapters/advanced_topics.html) describes custom MIDI mappings and controller scripting. The [MIDI scripting documentation](https://github.com/mixxxdj/mixxx/wiki/MIDI-Scripting) specifies XML `Script-Binding` dispatch to controller functions. These functions run inside Mixxx and have access to `engine`; a web page does not.

The [2.5 API declarations](https://github.com/mixxxdj/mixxx/blob/2.5/res/controllers/engine-api.d.ts) and [2.5 implementation](https://github.com/mixxxdj/mixxx/blob/2.5/src/controllers/scripting/legacy/controllerscriptinterfacelegacy.cpp) were reviewed together. `scratchEnable` sets up the resolution, nominal RPM, and alpha-beta filter. `scratchTick` accumulates integer movement intervals. `scratchDisable` ends scratching with an optional ramp. Re-enabling resets the accumulator and filter, so this mapping enables once on touch, sends movement ticks while held, and disables on release.

Platter One uses 2048 intervals/revolution, 33⅓ RPM, alpha 1/8, beta 1/256, immediate hold on contact, and Mixxx's release ramp. These are starting values, not an audible-quality claim. The mapping does not write `play`, cue points, mixer state, or raw scratch engine controls.

There was no documented simpler direct browser entry point to these engine functions in the reviewed API. Retaining Mixxx's MIDI boundary avoids modifying Mixxx or using an unsupported embedded network API.

## Reference implementations inspected

| Project | Reviewed source | Useful finding | Why it is not used verbatim |
| --- | --- | --- | --- |
| [TouchMixxx](https://github.com/VoidRatio/TouchMixxx/tree/d1724c6db0313d66e8fa1387b50edaf0d7f8c9d9) | `src/TouchMixxx.js`, particularly the jog class, and MIDI XML | TouchOSC MIDI bindings reach the scratch functions; the jog class uses the standard filter coefficients | Its scratch path is shift-driven, uses direction-based steps and repeated enable calls, and depends on TouchOSC/components. It is GPL-3.0 |
| [Mixxx API Controller](https://github.com/phijimmy/mixxx_api_controller/tree/1faffd7bd235227aed9b222e4d84f83775c2bcac) | `api/mixxx_api_server.py`, `controllers/mixxx_controller.js`, requirements and docs | Browser/server/MIDI/script separation is viable | The bridge directly opens `/dev/snd/midiC*` and assumes Linux ALSA/VirMIDI. Its WebSocket is mainly for status while controls use REST. The broad API is unnecessary here. It is MIT licensed |
| [touchosc-dj](https://github.com/grufkork/touchosc-dj/tree/c16298bf89dabbb7c9558c12954edf62fa3d916c) | `mapping/Grufkork-TouchOSC-scripts.js`, MIDI XML, README | Relative encoder motion is mapped to Mixxx via controller script functions | The jog functions write scaled `jog` values, not the explicit touch/scratch lifecycle needed here. The setup also relies on TouchOSC Bridge. Its license is GPL-3.0 |

No source from those projects is bundled or copied into this implementation. The MIT license covers Platter One's original code. Mixxx itself is a separate application with its own licensing.

## macOS bridge choice

Python with aiohttp provides one small HTTP/WebSocket server. python-rtmidi publishes a native CoreMIDI virtual source. A temporary virtual port and receiving client were tested on this Mac, confirming exact three-byte MIDI delivery. This removes IAC configuration from the default setup. Sending to a named existing IAC destination remains available as a fallback.

Using the same server origin for HTML and WebSocket avoids HTTPS/HTTP mixed-content problems. Safari does not need Web MIDI or an AudioContext. Plain HTTP on a trusted LAN is enough for this input path, although Safari/macOS local-network permissions can still intervene and must be checked on the actual devices.

## Input design

Pointer Events provide pointer capture and cancellation. A single active pointer determines angular deltas using the record's actual bounding rectangle, including when that center is beyond the visible half-platter area. Wrapped angle subtraction avoids a large jump at ±π. The central 9% of the diameter is a dead zone; crossing it clears the angular anchor. Movement outside the record similarly re-anchors on re-entry.

The bridge accumulates fractional ticks before integer conversion. Signed ticks are split into relative CC chunks without losing total distance. It does not intentionally smooth or batch events, leaving the scratch filter in Mixxx. A stationary finger needs no movement tick, but must refresh its hold lease.

The network, browser event loop, MIDI scheduler, script thread, Mixxx filter, and audio buffer all contribute latency. Reliable musical timing and audible quality remain physical acceptance checks. Browser WebSockets use TCP, so head-of-line delay can still be felt on a poor network.

## Scope

Two selectable decks share one platter. There is no browser playback, audio processing, mixer, cue, cut, sampler, library, track telemetry, or Ableton control implementation. The geometry/protocol layer can inform a later controller experiment without introducing that work now.
