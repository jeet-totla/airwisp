"""Synthetic hand + watch streams for testing the pipeline."""
import math, random
from . import protocol as P


def circle_scenario(duration=4.0, cam_hz=30, imu_hz=100, noise=0.004, seed=1, gyro_noise=0.02):
    """Hand traces a circle in the active zone. Yields (t, kind, payload) sorted by time.
    truth(t) -> camera-normalized (mirrored-input) position."""
    rnd = random.Random(seed)

    def truth(t):
        w = 2 * math.pi * 0.5
        return 0.5 + 0.15 * math.cos(w * t), 0.5 + 0.15 * math.sin(w * t)

    events = []
    n = int(duration * cam_hz)
    for i in range(n):
        t = i / cam_hz
        x, y = truth(t)
        events.append((t, "cam", (x + rnd.gauss(0, noise), y + rnd.gauss(0, noise))))
    n = int(duration * imu_hz)
    for i in range(1, n):
        t = i / imu_hz
        x0, y0 = truth(t - 1 / imu_hz); x1, y1 = truth(t)
        vx, vy = (x1 - x0) * imu_hz, (y1 - y0) * imu_hz   # camera-normalized velocity
        # screen-unit velocity = (-vx/zone_w, vy/zone_h) with defaults 0.6/0.5 ; convert to gyro rates via gain 0.35
        sux, suy = -vx / 0.6, vy / 0.5
        yaw = sux / 0.35; pitch = suy / 0.35
        events.append((t, "imu", (0.0, pitch + rnd.gauss(0, gyro_noise), -yaw + rnd.gauss(0, gyro_noise))))
    events.sort(key=lambda e: e[0])
    return events, truth
