// SPDX-License-Identifier: MIT
// Runs inside Mixxx 2.5, never inside the browser.
var PlatterOne = {};
PlatterOne.held = [false, false];
PlatterOne.lastHold = [0, 0];
PlatterOne.timer = 0;
PlatterOne.release = function(deck) {
    if (PlatterOne.held[deck - 1]) {
        engine.scratchDisable(deck, true);
        PlatterOne.held[deck - 1] = false;
    }
};
PlatterOne.init = function() {
    PlatterOne.held = [false, false];
    PlatterOne.lastHold = [0, 0];
    PlatterOne.timer = engine.beginTimer(100, function() {
        for (var deck = 1; deck <= 2; deck++) {
            if (Date.now() - PlatterOne.lastHold[deck - 1] > 750) {
                PlatterOne.release(deck);
            }
        }
    });
};
PlatterOne.touch = function(channel, control, value, status, group) {
    var deck = channel + 1;
    if (deck < 1 || deck > 2) { return; }
    if (value > 0 && (status & 0xF0) === 0x90) {
        if (!PlatterOne.held[channel]) {
            // Stop on contact; Mixxx handles the velocity filter and release ramp.
            engine.scratchEnable(deck, 2048, 33 + 1 / 3, 1 / 8, 1 / 256, false);
            PlatterOne.held[channel] = true;
        }
        PlatterOne.lastHold[channel] = Date.now();
    } else {
        PlatterOne.release(deck);
    }
};
PlatterOne.move = function(channel, control, value, status, group) {
    if (channel < 0 || channel > 1 || !PlatterOne.held[channel]) { return; }
    PlatterOne.lastHold[channel] = Date.now();
    engine.scratchTick(channel + 1, value - 64);
};
PlatterOne.hold = function(channel, control, value, status, group) {
    if (channel >= 0 && channel <= 1 && PlatterOne.held[channel]) {
        PlatterOne.lastHold[channel] = Date.now();
    }
};
PlatterOne.shutdown = function() {
    PlatterOne.release(1);
    PlatterOne.release(2);
    if (PlatterOne.timer) { engine.stopTimer(PlatterOne.timer); }
    PlatterOne.timer = 0;
};
