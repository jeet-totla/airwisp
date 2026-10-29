"""Gesture state machine. Mirrors GestureEngine.swift.
Input methods return a list of actions: ("move",x,y) ("down",btn) ("up",btn) ("click",btn)
("scroll",dx,dy) ("haptic",kind) ("armed",bool). Coordinates are screen units (0..1)."""
from . import protocol as P

IDLE, PENDING, DRAGGING = "idle", "pending", "dragging"


class GestureEngine:
    def __init__(self, drag_hold=0.25, drag_move=0.02, fist_hold=0.6, watch_timeout=1.0,
                 cam_pinch_down=0.04, cam_pinch_up=0.07, scroll_gain=40.0, armed=True):
        self.armed = armed
        self.drag_hold, self.drag_move, self.fist_hold = drag_hold, drag_move, fist_hold
        self.watch_timeout = watch_timeout
        self.cam_down, self.cam_up = cam_pinch_down, cam_pinch_up
        self.scroll_gain = scroll_gain
        self.state = IDLE
        self.pos = (0.5, 0.5)
        self.anchor = (0.5, 0.5)
        self.pinch_t = 0.0
        self.scrolling = False
        self.last_watch_t = None
        self.fist_since = None
        self.fist_fired = False
        self._cam_pinched = False

    # --- helpers
    def watch_alive(self, t):
        return self.last_watch_t is not None and t - self.last_watch_t <= self.watch_timeout

    def touch_watch(self, t):
        self.last_watch_t = t

    def _set_armed(self, on):
        if on == self.armed:
            return []
        self.armed = on
        out = [("armed", on), ("haptic", P.HAPTIC_START if on else P.HAPTIC_STOP)]
        if not on and self.state == DRAGGING:
            out.insert(0, ("up", "left"))
        if not on:
            self.state = IDLE; self.scrolling = False
        return out

    # --- inputs
    def position(self, t, x, y):
        """New fused/filtered cursor position."""
        self.pos = (x, y)
        if not self.armed:
            return []
        if self.scrolling:
            return []
        if self.state == IDLE:
            return [("move", x, y)]
        if self.state == PENDING:
            if (abs(x - self.anchor[0]) > self.drag_move or abs(y - self.anchor[1]) > self.drag_move):
                self.state = DRAGGING
                return [("down", "left"), ("haptic", P.HAPTIC_START), ("move", x, y)]
            return []  # frozen while deciding click vs drag
        return [("move", x, y)]  # DRAGGING

    def tick(self, t):
        """Call periodically (>= 30Hz) to promote pending->drag on hold."""
        if self.armed and self.state == PENDING and t - self.pinch_t >= self.drag_hold:
            self.state = DRAGGING
            return [("down", "left"), ("haptic", P.HAPTIC_START)]
        return []

    def watch_event(self, t, code):
        self.touch_watch(t)
        if code == P.EV_FLIP:
            return self._set_armed(not self.armed)
        if not self.armed:
            return []
        if code == P.EV_PINCH_DOWN:
            return self._pinch_down(t)
        if code == P.EV_PINCH_UP:
            return self._pinch_up(t)
        if code == P.EV_DOUBLE_PINCH:
            # a double pinch's first pinch already started PENDING; cancel and right-click
            self.state = IDLE
            return [("move", *self.anchor), ("click", "right"), ("haptic", P.HAPTIC_CLICK)]
        if code == P.EV_SCROLL_START:
            self.scrolling = True
            return []
        if code == P.EV_SCROLL_END:
            self.scrolling = False
            return []
        return []

    def watch_imu(self, t, roll_rate, pitch_rate=0.0):
        """Scroll from wrist roll rate while scroll mode is active."""
        self.touch_watch(t)
        return []

    def scroll_rate(self, dt, roll_rate, yaw_rate):
        """Forearm twist (roll) scrolls vertically; wrist swing (yaw) scrolls horizontally."""
        if self.armed and self.scrolling:
            return [("scroll", -yaw_rate * dt * self.scroll_gain, -roll_rate * dt * self.scroll_gain)]
        return []

    def _pinch_down(self, t):
        if self.state != IDLE:
            return []
        self.state = PENDING
        self.anchor = self.pos
        self.pinch_t = t
        return []

    def _pinch_up(self, t):
        if self.state == PENDING:
            self.state = IDLE
            return [("move", *self.anchor), ("click", "left"), ("haptic", P.HAPTIC_CLICK)]
        if self.state == DRAGGING:
            self.state = IDLE
            return [("up", "left"), ("haptic", P.HAPTIC_CLICK)]
        return []

    def camera_pinch(self, t, dist):
        """Fallback pinch from camera thumb-index distance (normalized). Ignored when watch is alive."""
        if self.watch_alive(t) or not self.armed:
            self._cam_pinched = False
            return []
        if not self._cam_pinched and dist < self.cam_down:
            self._cam_pinched = True
            return self._pinch_down(t)
        if self._cam_pinched and dist > self.cam_up:
            self._cam_pinched = False
            return self._pinch_up(t)
        return []

    def camera_fist(self, t, is_fist):
        """Fist held for fist_hold seconds toggles armed (camera-only on/off)."""
        if not is_fist:
            self.fist_since = None; self.fist_fired = False
            return []
        if self.fist_since is None:
            self.fist_since = t
        if not self.fist_fired and t - self.fist_since >= self.fist_hold:
            self.fist_fired = True
            return self._set_armed(not self.armed)
        return []
