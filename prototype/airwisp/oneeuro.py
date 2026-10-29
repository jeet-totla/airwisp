"""One-Euro filter (Casiez et al. 2012). Mirrors OneEuro.swift."""
import math


class LowPass:
    def __init__(self):
        self.y = None

    def __call__(self, x, alpha):
        self.y = x if self.y is None else alpha * x + (1 - alpha) * self.y
        return self.y


def _alpha(cutoff, dt):
    tau = 1.0 / (2 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class OneEuro:
    def __init__(self, min_cutoff=1.2, beta=0.02, d_cutoff=1.0):
        self.min_cutoff, self.beta, self.d_cutoff = min_cutoff, beta, d_cutoff
        self.x = LowPass(); self.dx = LowPass()
        self.prev = None; self.t_prev = None

    def reset(self):
        self.__init__(self.min_cutoff, self.beta, self.d_cutoff)

    def __call__(self, x, t):
        if self.t_prev is None or t <= self.t_prev:
            self.t_prev = t; self.prev = x
            self.x(x, 1.0); self.dx(0.0, 1.0)
            return x
        dt = t - self.t_prev
        dx = (x - self.prev) / dt
        edx = self.dx(dx, _alpha(self.d_cutoff, dt))
        cutoff = self.min_cutoff + self.beta * abs(edx)
        out = self.x(x, _alpha(cutoff, dt))
        self.prev, self.t_prev = x, t
        return out


class OneEuro2D:
    def __init__(self, **kw):
        self.fx, self.fy = OneEuro(**kw), OneEuro(**kw)

    def reset(self):
        self.fx.reset(); self.fy.reset()

    def __call__(self, x, y, t):
        return self.fx(x, t), self.fy(y, t)
