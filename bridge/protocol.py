"""Transport-independent angular input to MIDI. No audio or mixer controls."""
import math
import time

TICKS_PER_REVOLUTION = 2048
HOLD_TIMEOUT = 0.5


class ScratchSession:
    def __init__(self, send, clock=time.monotonic):
        self.send = send
        self.clock = clock
        self.deck = None
        self.remainder = 0.0
        self.last_hold = 0.0

    def release(self):
        if self.deck is not None:
            self.send([0x90 + self.deck - 1, 0, 0])
        self.deck = None
        self.remainder = 0.0

    def expire(self):
        if self.deck is not None and self.clock() - self.last_hold > HOLD_TIMEOUT:
            self.release()
            return True
        return False

    def handle(self, message):
        if not isinstance(message, dict):
            raise ValueError('Expected an object')
        kind = message.get('type')
        deck = message.get('deck')
        if type(deck) is not int or deck not in (1, 2):
            raise ValueError('Deck must be 1 or 2')
        if kind == 'down':
            if self.deck is not None:
                raise ValueError('Release before touching again')
            self.deck = deck
            self.remainder = 0.0
            self.last_hold = self.clock()
            self.send([0x90 + deck - 1, 0, 127])
        elif kind == 'up':
            if self.deck == deck:
                self.release()
        elif kind in ('move', 'hold'):
            if self.deck != deck:
                raise ValueError('Touch required')
            self.last_hold = self.clock()
            if kind == 'hold':
                self.send([0xB0 + deck - 1, 0x11, 127])
                return
            delta = message.get('radians')
            if type(delta) not in (int, float) or not math.isfinite(delta) or abs(delta) > math.pi:
                raise ValueError('Invalid angular delta')
            total = self.remainder + delta * TICKS_PER_REVOLUTION / math.tau
            ticks = math.trunc(total)
            self.remainder = total - ticks
            while ticks:
                chunk = max(-63, min(63, ticks))
                self.send([0xB0 + deck - 1, 0x10, 64 + chunk])
                ticks -= chunk
        else:
            raise ValueError('Unknown input type')
