import math
import unittest
from bridge.protocol import ScratchSession, TICKS_PER_REVOLUTION


class ScratchTests(unittest.TestCase):
    def setUp(self):
        self.messages = []
        self.now = 0.0
        self.session = ScratchSession(self.messages.append, lambda: self.now)

    def down(self, deck=1):
        self.session.handle({'type': 'down', 'deck': deck})

    def move(self, radians, deck=1):
        self.session.handle({'type': 'move', 'deck': deck, 'radians': radians})

    def test_signed_rotation_and_channel(self):
        self.down(2)
        self.move(math.pi / 2, 2)
        self.assertEqual(self.messages[0], [0x91, 0, 127])
        self.assertEqual(sum(m[2] - 64 for m in self.messages[1:]), TICKS_PER_REVOLUTION // 4)
        self.assertTrue(all(m[0] == 0xB1 and m[1] == 0x10 and 1 <= m[2] <= 127 for m in self.messages[1:]))
        self.messages.clear()
        self.move(-math.pi / 2, 2)
        self.assertEqual(sum(m[2] - 64 for m in self.messages), -TICKS_PER_REVOLUTION // 4)

    def test_fractional_movement_survives_small_samples_and_reversal(self):
        self.down()
        for _ in range(1000):
            self.move(math.tau / TICKS_PER_REVOLUTION / 10)
        ticks = sum(m[2] - 64 for m in self.messages if m[0] == 0xB0)
        self.assertAlmostEqual(ticks + self.session.remainder, 100, places=8)
        for _ in range(1000):
            self.move(-math.tau / TICKS_PER_REVOLUTION / 10)
        ticks = sum(m[2] - 64 for m in self.messages if m[0] == 0xB0)
        self.assertAlmostEqual(ticks + self.session.remainder, 0, places=8)

    def test_stationary_hold_then_timeout(self):
        self.down()
        self.now = 0.4
        self.session.handle({'type': 'hold', 'deck': 1})
        self.now = 0.8
        self.assertFalse(self.session.expire())
        self.now = 1
        self.assertTrue(self.session.expire())
        self.assertEqual(self.messages[-1], [0x90, 0, 0])
        self.assertIsNone(self.session.deck)

    def test_release_idempotent_and_reject_move_without_touch(self):
        self.down()
        self.session.release()
        count = len(self.messages)
        self.session.release()
        self.assertEqual(len(self.messages), count)
        with self.assertRaises(ValueError):
            self.move(0.1)

    def test_bad_data_and_cross_deck_movement_rejected(self):
        self.down()
        for radians in [float('nan'), float('inf'), -4, 4, True, '0.1', None]:
            with self.subTest(radians=radians), self.assertRaises(ValueError):
                self.move(radians)
        for deck in [True, 1.0, 3, None]:
            with self.subTest(deck=deck), self.assertRaises(ValueError):
                self.session.handle({'type': 'hold', 'deck': deck})
        with self.assertRaises(ValueError):
            self.move(0.1, 2)
        with self.assertRaises(ValueError):
            self.down()


if __name__ == '__main__':
    unittest.main()
