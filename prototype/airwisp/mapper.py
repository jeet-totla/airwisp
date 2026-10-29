"""Active-zone mapper with optional 4-corner bilinear calibration. Mirrors Mapper.swift."""
from dataclasses import dataclass, field


def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else hi if v > hi else v


@dataclass
class Mapper:
    # Active zone in camera-normalized coords (x mirrored so moving right moves cursor right).
    zone_x: float = 0.2
    zone_y: float = 0.25
    zone_w: float = 0.6
    zone_h: float = 0.5
    mirror_x: bool = True
    # Calibration: camera-normalized positions of screen corners TL, TR, BL, BR (or None).
    corners: list = field(default_factory=lambda: None)

    def to_unit(self, cx, cy):
        """Camera-normalized (0..1, origin top-left, un-mirrored) -> screen unit square (0..1)."""
        if self.mirror_x:
            cx = 1.0 - cx
        if self.corners is None:
            u = (cx - self.zone_x) / self.zone_w
            v = (cy - self.zone_y) / self.zone_h
            return clamp(u), clamp(v)
        return self._inverse_bilinear(cx, cy)

    def _inverse_bilinear(self, px, py):
        # corners given already mirrored, in same space as (px,py). Solve P = bilinear(u,v) via Newton.
        tl, tr, bl, br = self.corners
        u, v = 0.5, 0.5
        for _ in range(20):
            fx = (1-u)*(1-v)*tl[0] + u*(1-v)*tr[0] + (1-u)*v*bl[0] + u*v*br[0] - px
            fy = (1-u)*(1-v)*tl[1] + u*(1-v)*tr[1] + (1-u)*v*bl[1] + u*v*br[1] - py
            dxu = (1-v)*(tr[0]-tl[0]) + v*(br[0]-bl[0])
            dxv = (1-u)*(bl[0]-tl[0]) + u*(br[0]-tr[0])
            dyu = (1-v)*(tr[1]-tl[1]) + v*(br[1]-bl[1])
            dyv = (1-u)*(bl[1]-tl[1]) + u*(br[1]-tr[1])
            det = dxu*dyv - dxv*dyu
            if abs(det) < 1e-12:
                break
            du = (fx*dyv - fy*dxv) / det
            dv = (dxu*fy - dyu*fx) / det
            u -= du; v -= dv
            if abs(du) < 1e-7 and abs(dv) < 1e-7:
                break
        return clamp(u), clamp(v)

    def set_corners_from_camera(self, tl, tr, bl, br):
        """Provide raw (un-mirrored) camera points captured while user points at each screen corner."""
        m = (lambda p: (1.0 - p[0], p[1])) if self.mirror_x else (lambda p: p)
        self.corners = [m(tl), m(tr), m(bl), m(br)]

    def clear_calibration(self):
        self.corners = None
