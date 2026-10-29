"""Complementary fusion of camera position (absolute, slow) and watch gyro (relative, fast).
Mirrors Fusion.swift. State is in screen-unit coordinates (0..1)."""
from .mapper import clamp


class Fusion:
    def __init__(self, alpha=0.3, gyro_gain_x=0.35, gyro_gain_y=0.35, max_gyro_age=0.25,
                 learn_rate=0.02, camera_timeout=0.4):
        self.alpha = alpha            # camera pull per frame
        self.gx_gain, self.gy_gain = gyro_gain_x, gyro_gain_y  # unit/rad
        self.max_gyro_age = max_gyro_age
        self.learn_rate = learn_rate
        self.camera_timeout = camera_timeout
        self.x = self.y = 0.5
        self.has_pos = False
        self.last_gyro_t = None
        self.last_cam_t = None
        # online gain learning accumulators
        self._int_gx = self._int_gy = 0.0   # integrated gyro since last cam frame (rad)
        self._last_cam = None

    def gyro(self, t, yaw_rate, pitch_rate):
        """yaw_rate: rad/s about vertical (moves cursor horizontally); pitch_rate: rad/s about lateral axis."""
        if not self.has_pos:
            self.last_gyro_t = t
            return self.x, self.y
        if self.last_gyro_t is not None:
            dt = t - self.last_gyro_t
            if 0 < dt <= self.max_gyro_age and (self.last_cam_t is None or t - self.last_cam_t <= self.camera_timeout):
                dx = yaw_rate * dt
                dy = pitch_rate * dt
                self.x = clamp(self.x + dx * self.gx_gain)
                self.y = clamp(self.y + dy * self.gy_gain)
                self._int_gx += dx; self._int_gy += dy
        self.last_gyro_t = t
        return self.x, self.y

    def camera(self, t, ux, uy, confidence=1.0):
        """ux, uy: mapped screen unit coords from camera. Pull estimate toward them."""
        if not self.has_pos or (self.last_cam_t is not None and t - self.last_cam_t > self.camera_timeout):
            self.x, self.y, self.has_pos = ux, uy, True
        else:
            # learn gain: camera movement vs integrated gyro since previous camera frame
            if self._last_cam is not None:
                cdx, cdy = ux - self._last_cam[0], uy - self._last_cam[1]
                if abs(self._int_gx) > 0.02:
                    g = max(0.05, min(1.5, cdx / self._int_gx))
                    self.gx_gain += self.learn_rate * (g - self.gx_gain)
                if abs(self._int_gy) > 0.02:
                    g = max(0.05, min(1.5, cdy / self._int_gy))
                    self.gy_gain += self.learn_rate * (g - self.gy_gain)
            a = self.alpha * clamp(confidence)
            self.x += a * (ux - self.x)
            self.y += a * (uy - self.y)
        self._last_cam = (ux, uy)
        self._int_gx = self._int_gy = 0.0
        self.last_cam_t = t
        return self.x, self.y

    def lost(self, t):
        return self.last_cam_t is None or t - self.last_cam_t > self.camera_timeout
