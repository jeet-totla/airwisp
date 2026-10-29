"""Wire protocol. Mirrors Shared/AirwispCore/Protocol.swift."""
import struct
from dataclasses import dataclass

MAGIC = 0xA5
T_IMU, T_EVENT, T_HELLO, T_HAPTIC = 0x01, 0x02, 0x03, 0x10
EV_PINCH_DOWN, EV_PINCH_UP, EV_DOUBLE_PINCH, EV_FLIP, EV_SCROLL_START, EV_SCROLL_END = 1, 2, 3, 4, 5, 6
HAPTIC_CLICK, HAPTIC_START, HAPTIC_STOP = 1, 2, 3

_HDR = struct.Struct("<BBHI")  # magic, type, seq, t_ms


@dataclass
class Imu:
    seq: int; t_ms: int
    gx: float; gy: float; gz: float
    ax: float; ay: float; az: float


@dataclass
class Event:
    seq: int; t_ms: int; code: int


@dataclass
class Hello:
    seq: int; t_ms: int; name: str


@dataclass
class Haptic:
    seq: int; t_ms: int; kind: int


def encode_imu(seq, t_ms, g, a):
    return _HDR.pack(MAGIC, T_IMU, seq & 0xFFFF, t_ms & 0xFFFFFFFF) + struct.pack("<6f", *g, *a)


def encode_event(seq, t_ms, code):
    return _HDR.pack(MAGIC, T_EVENT, seq & 0xFFFF, t_ms & 0xFFFFFFFF) + bytes([code])


def encode_hello(seq, t_ms, name):
    return _HDR.pack(MAGIC, T_HELLO, seq & 0xFFFF, t_ms & 0xFFFFFFFF) + name.encode()[:64]


def encode_haptic(seq, t_ms, kind):
    return _HDR.pack(MAGIC, T_HAPTIC, seq & 0xFFFF, t_ms & 0xFFFFFFFF) + bytes([kind])


def decode(data: bytes):
    """Return a message object or None for malformed packets."""
    if len(data) < _HDR.size:
        return None
    magic, typ, seq, t = _HDR.unpack_from(data)
    if magic != MAGIC:
        return None
    body = data[_HDR.size:]
    if typ == T_IMU and len(body) == 24:
        v = struct.unpack("<6f", body)
        return Imu(seq, t, *v)
    if typ == T_EVENT and len(body) == 1:
        return Event(seq, t, body[0])
    if typ == T_HELLO:
        try:
            return Hello(seq, t, body.decode())
        except UnicodeDecodeError:
            return None
    if typ == T_HAPTIC and len(body) == 1:
        return Haptic(seq, t, body[0])
    return None


def seq_newer(a: int, b: int) -> bool:
    """True if u16 seq a is newer than b (wraparound-safe)."""
    return a != b and ((a - b) & 0xFFFF) < 0x8000
