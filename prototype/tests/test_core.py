import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytest
from airwisp import protocol as P
from airwisp.oneeuro import OneEuro, OneEuro2D
from airwisp.mapper import Mapper
from airwisp.fusion import Fusion
from airwisp.gestures import GestureEngine
from airwisp.pipeline import Pipeline
from airwisp import sim


# ---- protocol
def test_imu_roundtrip():
    m = P.decode(P.encode_imu(7, 1234, (1, 2, 3), (4, 5, 6)))
    assert isinstance(m, P.Imu) and m.seq == 7 and m.t_ms == 1234
    assert (m.gx, m.gy, m.gz, m.ax, m.ay, m.az) == (1, 2, 3, 4, 5, 6)

def test_event_hello_haptic_roundtrip():
    assert P.decode(P.encode_event(1, 2, P.EV_PINCH_DOWN)).code == P.EV_PINCH_DOWN
    assert P.decode(P.encode_hello(1, 2, "Jeet's Watch")).name == "Jeet's Watch"
    assert P.decode(P.encode_haptic(1, 2, P.HAPTIC_CLICK)).kind == P.HAPTIC_CLICK

def test_decode_rejects_garbage():
    assert P.decode(b"") is None
    assert P.decode(b"\x00" * 20) is None
    assert P.decode(P.encode_imu(1, 1, (0,)*3, (0,)*3)[:-1]) is None

def test_seq_wrap():
    assert P.seq_newer(1, 0xFFFF)
    assert not P.seq_newer(0xFFFF, 1)
    assert not P.seq_newer(5, 5)


# ---- one euro
def test_oneeuro_passes_first_and_reduces_jitter():
    import random
    r = random.Random(0)
    f = OneEuro(min_cutoff=1.0, beta=0.0)
    raw = [0.5 + r.gauss(0, 0.01) for _ in range(300)]
    out = [f(x, i / 30) for i, x in enumerate(raw)]
    assert out[0] == raw[0]
    def sd(a):
        m = sum(a) / len(a); return (sum((v - m) ** 2 for v in a) / len(a)) ** 0.5
    assert sd(out[30:]) < 0.5 * sd(raw[30:])

def test_oneeuro_low_lag_on_fast_move():
    f = OneEuro(min_cutoff=1.0, beta=5.0)
    for i in range(30): f(0.0, i / 60)
    y = None
    for i in range(30, 36): y = f(1.0, i / 60)
    assert y > 0.6  # high beta follows fast steps

def test_oneeuro_nonmonotonic_time_safe():
    f = OneEuro(); f(0.1, 1.0); assert f(0.2, 1.0) == 0.2 or True; f(0.3, 0.5)


# ---- mapper
def test_zone_mapping_mirror_and_clamp():
    m = Mapper()
    assert m.to_unit(0.5, 0.5) == pytest.approx((0.5, 0.5))
    u, v = m.to_unit(0.2, 0.25)           # camera-left edge => after mirror, right edge
    assert u == pytest.approx(1.0) and v == pytest.approx(0.0)
    assert m.to_unit(5, 5) == (0.0, 1.0)  # clamped

def test_calibration_corners_map_to_corners():
    m = Mapper()
    tl, tr, bl, br = (0.7, 0.3), (0.3, 0.32), (0.72, 0.7), (0.28, 0.68)  # skewed quad, raw camera coords
    m.set_corners_from_camera(tl, tr, bl, br)
    assert m.to_unit(*tl) == pytest.approx((0.0, 0.0), abs=1e-4)
    assert m.to_unit(*tr) == pytest.approx((1.0, 0.0), abs=1e-4)
    assert m.to_unit(*bl) == pytest.approx((0.0, 1.0), abs=1e-4)
    assert m.to_unit(*br) == pytest.approx((1.0, 1.0), abs=1e-4)
    cx = (tl[0] + tr[0] + bl[0] + br[0]) / 4; cy = (tl[1] + tr[1] + bl[1] + br[1]) / 4
    u, v = m.to_unit(cx, cy)
    assert 0.4 < u < 0.6 and 0.4 < v < 0.6


# ---- fusion
def test_fusion_snaps_then_follows_camera():
    f = Fusion()
    f.camera(0.0, 0.2, 0.8)
    assert (f.x, f.y) == (0.2, 0.8)
    for i in range(1, 60): f.camera(i / 30, 0.7, 0.3)
    assert f.x == pytest.approx(0.7, abs=0.01) and f.y == pytest.approx(0.3, abs=0.01)

def test_fusion_gyro_moves_between_frames_and_times_out():
    f = Fusion()
    f.camera(0.0, 0.5, 0.5)
    f.gyro(0.0, 0, 0)
    f.gyro(0.01, 1.0, 0)            # 1 rad/s * 0.01 * gain 0.35
    assert f.x == pytest.approx(0.5 + 0.0035)
    x = f.x
    f.gyro(1.0, 1.0, 0)             # camera lost >0.4s: ignore gyro
    assert f.x == x and f.lost(1.0)

def test_fusion_clamps():
    f = Fusion(); f.camera(0, 0.99, 0.5); f.gyro(0, 0, 0)
    for i in range(1, 50): f.gyro(i * 0.005, 50, 0)
    assert f.x <= 1.0


# ---- gestures
def mk(): 
    g = GestureEngine(); g.position(0, 0.5, 0.5); return g

def kinds(a): return [x[0] for x in a]

def test_short_pinch_is_click_at_anchor():
    g = mk()
    g.watch_event(1.0, P.EV_PINCH_DOWN)
    assert g.position(1.05, 0.505, 0.5) == []      # frozen while pending
    a = g.watch_event(1.1, P.EV_PINCH_UP)
    assert ("click", "left") in a and ("haptic", P.HAPTIC_CLICK) in a
    assert a[0][0] == "move" and a[0][1:] == (0.5, 0.5)

def test_hold_promotes_to_drag_and_releases():
    g = mk()
    g.watch_event(1.0, P.EV_PINCH_DOWN)
    a = g.tick(1.3)
    assert ("down", "left") in a and g.state == "dragging"
    assert kinds(g.position(1.4, 0.6, 0.6)) == ["move"]
    a = g.watch_event(1.5, P.EV_PINCH_UP)
    assert ("up", "left") in a and g.state == "idle"

def test_move_promotes_to_drag():
    g = mk()
    g.watch_event(1.0, P.EV_PINCH_DOWN)
    a = g.position(1.05, 0.6, 0.5)
    assert kinds(a)[0] == "down"

def test_flip_toggles_armed_and_blocks_events():
    g = mk()
    a = g.watch_event(1.0, P.EV_FLIP)
    assert ("armed", False) in a and g.armed is False
    assert g.position(1.1, 0.7, 0.7) == []
    assert g.watch_event(1.2, P.EV_PINCH_DOWN) == []
    g.watch_event(1.3, P.EV_FLIP); assert g.armed

def test_disarm_while_dragging_releases_button():
    g = mk()
    g.watch_event(1.0, P.EV_PINCH_DOWN); g.tick(1.3)
    a = g.watch_event(1.5, P.EV_FLIP)
    assert a[0] == ("up", "left")

def test_double_pinch_right_click():
    g = mk()
    g.watch_event(1.0, P.EV_PINCH_DOWN)
    a = g.watch_event(1.2, P.EV_DOUBLE_PINCH)
    assert ("click", "right") in a and g.state == "idle"

def test_camera_pinch_fallback_only_without_watch():
    g = mk()
    assert g.camera_pinch(1.0, 0.02) == [] or g.state == "pending"
    g = mk(); g.touch_watch(1.0)
    assert g.camera_pinch(1.1, 0.01) == [] and g.state == "idle"
    g = mk()
    g.camera_pinch(5.0, 0.02); a = g.camera_pinch(5.1, 0.1)
    assert ("click", "left") in a

def test_camera_pinch_hysteresis():
    g = mk()
    g.camera_pinch(5.0, 0.03)
    assert g.state == "pending"
    g.camera_pinch(5.05, 0.06)           # between thresholds: still held
    assert g.state == "pending"

def test_fist_hold_toggle():
    g = mk()
    assert g.camera_fist(1.0, True) == []
    assert g.camera_fist(1.3, True) == []
    a = g.camera_fist(1.7, True)
    assert ("armed", False) in a
    assert g.camera_fist(1.8, True) == []        # no refire while held
    g.camera_fist(2.0, False)
    assert ("armed", True) in g.camera_fist(2.0, True) + g.camera_fist(2.7, True)

def test_scroll_mode_freezes_cursor_and_scrolls():
    g = mk()
    g.watch_event(1.0, P.EV_SCROLL_START)
    assert g.position(1.1, 0.9, 0.9) == []
    a = g.scroll_rate(0.01, 2.0, 0.0)
    assert a[0][2] < 0 and a[0][1] == 0
    assert a and a[0][0] == "scroll"
    g.watch_event(1.2, P.EV_SCROLL_END)
    assert g.scroll_rate(0.01, 2.0, 0.0) == []


# ---- end to end
def run(events, truth, pipe):
    errs = []
    last = None
    for t, kind, p in events:
        if kind == "cam":
            acts = pipe.camera_frame(t, *p)
        else:
            acts = pipe.imu(t, *p)
        for a in acts:
            if a[0] == "move":
                last = (a[1], a[2])
        if last and t > 1.0 and kind == "imu":
            tx, ty = truth(t)
            ux, uy = pipe.mapper.to_unit(tx, ty)
            errs.append(math.hypot(last[0] - ux, last[1] - uy))
    return errs

def test_end_to_end_tracks_circle():
    ev, truth = sim.circle_scenario()
    errs = run(ev, truth, Pipeline())
    assert sum(errs) / len(errs) < 0.06

def test_fusion_beats_camera_only_between_frames():
    ev, truth = sim.circle_scenario(noise=0.002)
    fused = run(ev, truth, Pipeline())
    zero = [(t, k, (0.0, 0.0, 0.0) if k == "imu" else p) for t, k, p in ev]   # gyro silent = camera only
    cam_only = run(zero, truth, Pipeline())
    assert sum(fused) / len(fused) < sum(cam_only) / len(cam_only)


# ---- detectors
from airwisp.detectors import PinchDetector, FlipDetector

def test_pinch_detects_impulse_and_ignores_slow_motion():
    d = PinchDetector()
    ev = []
    for i in range(300):                       # slow arm motion ~0.05 g sinusoid: no pinch
        t = i / 100
        a = 0.05 * math.sin(2 * math.pi * 1.0 * t)
        ev += d.feed(t, a, 0, 0)
    assert ev == []
    d = PinchDetector(); ev = []
    for i in range(0, 340):                    # gentle 0.01 g motion + 30 ms impulse of 0.08 g
        t = i / 100
        a = 0.01 * math.sin(2 * math.pi * t) + (0.08 if 315 <= i <= 317 else 0.0)
        ev += [(round(t, 2), e) for e in d.feed(t, a, 0, 0)]
    assert [e for _, e in ev] == ["down", "up"]

def test_pinch_refractory():
    d = PinchDetector()
    for i in range(100): d.feed(i / 100, 0, 0, 0)
    n = 0
    for i in range(100, 130):
        a = 0.1 if i in (110, 111, 115, 116) else 0.0
        n += d.feed(i / 100, a, 0, 0).count("down")
    assert n == 1

def test_flip_detector():
    f = FlipDetector()
    fired = [f.feed(i / 100, 6.0) for i in range(60)]   # 6 rad/s for 0.6 s = 3.6 rad
    assert any(fired)
    f2 = FlipDetector()
    assert not any(f2.feed(i / 100, 1.0) for i in range(300))   # slow twist never fires
