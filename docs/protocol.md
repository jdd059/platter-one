# Input protocol v1

The page connects to `/ws?token=...` on its own HTTP server origin. The token comes from the fragment of the bridge's printed URL. Only one paired WebSocket owns the controller. Each JSON message is at most 1024 bytes. All deck values are integers 1 or 2.

| JSON type | Fields | Meaning |
| --- | --- | --- |
| `down` | `deck` | Begin one touch; no other touch may be active |
| `move` | `deck`, `radians` | Finite signed angular displacement in [-π, π], clockwise positive |
| `hold` | `deck` | Renew a stationary touch's lease |
| `up` | `deck` | End the active touch; duplicate release is harmless |
| `ping` | `time` | Finite browser clock value echoed as a `pong` for transport round-trip measurement |

The bridge sends `hello` with `output` equal to `midi` or `dry-run`, `pong` with echoed time, `released` after a hold lease expires, or `busy` if another controller owns the connection. These messages do not confirm Mixxx state. Late motion after a release cannot start a new scratch. A new touch is required.

## MIDI

MIDI channel 1 is deck 1; channel 2 is deck 2. Only the dedicated virtual source or explicitly selected existing output receives these messages.

| Status | Data 1 | Data 2 | Mapping handler |
| --- | --- | --- | --- |
| Note On `0x90` / `0x91` | `0x00` | 127 on contact, 0 on release | `PlatterOne.touch` |
| Note Off `0x80` / `0x81` | `0x00` | Any value, accepted defensively | `PlatterOne.touch` |
| CC `0xB0` / `0xB1` | `0x10` | Signed integer chunk + 64, range 1–127 | `PlatterOne.move` |
| CC `0xB0` / `0xB1` | `0x11` | 127 | `PlatterOne.hold` |

Movement resolution is 2048 ticks per revolution. Quantization retains the fractional remainder for the next sample; direction changes preserve net displacement. Each CC chunk is at most 63 ticks in either direction. Both bridge and Mixxx script must agree on resolution.

The bridge releases at 500 ms without move/hold input. The mapping checks every 100 ms and releases after 750 ms without received MIDI movement/hold. Browser heartbeats are sent every 100 ms; the UI closes the connection after 700 ms without a bridge response or if outgoing buffering exceeds 1024 bytes. These thresholds favor releasing a stuck touch; they do not guarantee a maximum end-to-end delay.
