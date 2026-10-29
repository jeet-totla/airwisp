"""Watch-side IMU gesture detectors. Mirrors Detectors.swift. Run on the Watch at ~100 Hz."""
from collections import deque


class PinchDetector:
    """Detects the small impulse a finger-thumb tap makes in user acceleration (gravity removed, in g).
    Emits 'down' at the impulse and 'up' release_delay later (tap model). Thresholds are tunable
    from the Watch UI because real-world values must be measured on-device."""

    def __init__(self, threshold=0.0004, ratio=6.0, refractory=0.25, release_delay=0.09,
                 fast_alpha=0.35, slow_alpha=0.02, warmup=1.0):
        self.threshold, self.ratio, self.refractory, self.release_delay = threshold, ratio, refractory, release_delay
        self.fa, self.sa = fast_alpha, slow_alpha
        self.fast = 0.0; self.slow = 0.0
        self.last_spike = -1e9
        self.pending_up = None
        self.warmup = warmup
        self.t0 = None

    def feed(self, t, ax, ay, az):
        """Returns list of 'down'/'up' strings."""
        out = []
        if self.t0 is None:
            self.t0 = t
        e = ax * ax + ay * ay + az * az
        self.fast += self.fa * (e - self.fast)
        self.slow += self.sa * (e - self.slow)
        if self.pending_up is not None and t >= self.pending_up:
            out.append("up"); self.pending_up = None
        if t - self.t0 < self.warmup:
            return out
        if (self.fast > self.threshold and self.fast > self.ratio * max(self.slow, 1e-7)
                and t - self.last_spike >= self.refractory):
            self.last_spike = t
            self.pending_up = t + self.release_delay
            out.append("down")
        return out


class FlipDetector:
    """Forearm flip: integrates roll rate over a sliding window; a fast ~140 degree twist toggles."""

    def __init__(self, window=0.6, angle=2.4, cooldown=1.5):
        self.window, self.angle, self.cooldown = window, angle, cooldown
        self.buf = deque()   # (t, delta_angle)
        self.sum = 0.0
        self.last_t = None
        self.last_fire = -1e9

    def feed(self, t, roll_rate):
        if self.last_t is not None:
            d = roll_rate * (t - self.last_t)
            self.buf.append((t, d)); self.sum += d
        self.last_t = t
        while self.buf and t - self.buf[0][0] > self.window:
            self.sum -= self.buf.popleft()[1]
        if abs(self.sum) >= self.angle and t - self.last_fire >= self.cooldown:
            self.last_fire = t
            self.buf.clear(); self.sum = 0.0
            return True
        return False
