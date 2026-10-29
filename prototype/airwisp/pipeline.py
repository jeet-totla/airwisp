"""Glue: camera + watch inputs -> actions. Mirrors Pipeline.swift."""
from .fusion import Fusion
from .gestures import GestureEngine
from .mapper import Mapper
from .oneeuro import OneEuro2D
from . import protocol as P


class Pipeline:
    def __init__(self, mapper=None, fusion=None, gestures=None, filt=None):
        self.mapper = mapper or Mapper()
        self.fusion = fusion or Fusion()
        self.gestures = gestures or GestureEngine()
        self.filt = filt or OneEuro2D(min_cutoff=1.2, beta=0.02)
        self.out = []
        self._last_imu_t = None
        self.yaw_sign = -1.0
        self.pitch_sign = 1.0

    def camera_frame(self, t, cx, cy, confidence=1.0, pinch_dist=None, fist=False):
        acts = []
        ux, uy = self.mapper.to_unit(cx, cy)
        fx, fy = self.fusion.camera(t, ux, uy, confidence)
        sx, sy = self.filt(fx, fy, t)
        acts += self.gestures.position(t, sx, sy)
        if pinch_dist is not None:
            acts += self.gestures.camera_pinch(t, pinch_dist)
        acts += self.gestures.camera_fist(t, fist)
        acts += self.gestures.tick(t)
        return acts

    def camera_lost(self, t):
        return self.gestures.tick(t)

    def imu(self, t, gx, gy, gz):
        """Watch frame: x along forearm toward fingers (crown side on left wrist), y across, z out of screen.
        yaw (swing left/right) = about z -> horizontal; pitch (flexion up/down) = about y -> vertical;
        roll (forearm twist) = about x -> scroll. Signs are configurable; wrong signs degrade gracefully
        (fusion learns gain >= 0.05 so camera dominates)."""
        acts = []
        self.gestures.touch_watch(t)
        dt = 0.0 if self._last_imu_t is None else t - self._last_imu_t
        self._last_imu_t = t
        x, y = self.fusion.gyro(t, self.yaw_sign * gz, self.pitch_sign * gy)
        if self.fusion.has_pos and not self.fusion.lost(t):
            sx, sy = self.filt(x, y, t)
            acts += self.gestures.position(t, sx, sy)
        if dt > 0:
            acts += self.gestures.scroll_rate(dt, gx, gz)
        acts += self.gestures.tick(t)
        return acts

    def watch_event(self, t, code):
        return self.gestures.watch_event(t, code)
