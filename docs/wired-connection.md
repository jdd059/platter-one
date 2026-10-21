# Wired control and responsiveness

The bridge accepts HTTP/WebSocket traffic on all local interfaces. A working wired IP route can carry the same controller messages without a frontend transport rewrite. Safari is still sending network traffic; plugging in a USB-C cable does not by itself move the existing Wi-Fi WebSocket onto that cable.

## Direct USB-C to the Mac

Apple documents sharing a Mac's network connection to USB/Thunderbolt-connected iPhones and iPads through **System Settings > General > Sharing > Content Caching > Share Internet connection**. The documented prerequisites include an Ethernet internet connection on the Mac and external power for a Mac laptop. This path is relevant to Wi-Fi-only iPads; it does not depend on an iPad cellular plan.

Source: [Apple Platform Deployment: shared internet connection](https://support.apple.com/guide/deployment/dep38ff24bed/web) and [Content Caching settings](https://support.apple.com/guide/deployment/dep163612d39/web).

For that setup:

1. Connect the powered Mac to Ethernet and connect the unlocked iPad with a USB-C data cable
2. Accept the device trust prompt if shown, then enable the documented sharing option on the Mac
3. Determine the Mac address on the newly active USB/shared network and use that address in the pairing URL, retaining its full token
4. Turn off Wi-Fi on the iPad and reload the controller to force a new connection
5. Confirm the controller still connects and control reaches Mixxx; inspect the bridge TCP connection and route on the Mac to verify the USB interface

This configuration has **not been enabled or verified** on the development setup. USB attachment was detected; Content Caching internet sharing was not active. No system sharing, cache, firewall, or network settings were changed by Platter One. Do not enable a broad cache service solely on the assumption that it will improve latency; review its settings and verify the actual route.

## Ethernet alternative

Apple lists USB-to-Ethernet adapters among supported iPad USB-C accessories: [USB-C on iPad](https://support.apple.com/108894). Connecting both the Mac and iPad to the same Ethernet network provides a wired IP path for this app. Use the Mac's Ethernet address in the pairing URL, keep the token, and disable iPad Wi-Fi for the verification pass. An iPad Ethernet adapter with power delivery can also maintain charging.

A wired iPad with a Mac still using Wi-Fi retains a wireless hop. No particular adapter or purchase is required by the application.

## Measure rather than infer

The displayed round-trip time covers browser-to-bridge traffic only. Compare its typical value and spikes between Wi-Fi and the verified wired route. Wired networking can reduce network jitter; it does not eliminate Safari event dispatch, rendering, MIDI scheduling, Mixxx's scratch filtering, or the audio buffer. No measured speedup is claimed until an actual wired device test is complete.

A direct raw-USB/MIDI transport is a separate native-device integration, not something the current HTTP/WebSocket controller switches on automatically.
