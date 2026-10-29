import Foundation

/// Wire protocol. Mirrors prototype/airwisp/protocol.py. Little-endian.
public enum Wire {
    public static let magic: UInt8 = 0xA5
    public static let headerSize = 8
    public enum MsgType: UInt8 { case imu = 0x01, event = 0x02, hello = 0x03, haptic = 0x10 }
}

public enum WatchEventCode: UInt8 {
    case pinchDown = 1, pinchUp, doublePinch, flip, scrollStart, scrollEnd
}

public enum HapticKind: UInt8 { case click = 1, start, stop }

public enum Message: Equatable {
    case imu(seq: UInt16, tMs: UInt32, gyro: SIMD3<Float>, accel: SIMD3<Float>)
    case event(seq: UInt16, tMs: UInt32, code: WatchEventCode)
    case hello(seq: UInt16, tMs: UInt32, name: String)
    case haptic(seq: UInt16, tMs: UInt32, kind: HapticKind)
}

public enum Codec {
    private static func header(_ type: Wire.MsgType, _ seq: UInt16, _ tMs: UInt32) -> Data {
        var d = Data()
        d.append(Wire.magic); d.append(type.rawValue)
        d.append(contentsOf: withUnsafeBytes(of: seq.littleEndian) { Array($0) })
        d.append(contentsOf: withUnsafeBytes(of: tMs.littleEndian) { Array($0) })
        return d
    }

    public static func encode(_ m: Message) -> Data {
        switch m {
        case let .imu(seq, t, g, a):
            var d = header(.imu, seq, t)
            for v in [g.x, g.y, g.z, a.x, a.y, a.z] {
                d.append(contentsOf: withUnsafeBytes(of: v.bitPattern.littleEndian) { Array($0) })
            }
            return d
        case let .event(seq, t, code):
            var d = header(.event, seq, t); d.append(code.rawValue); return d
        case let .hello(seq, t, name):
            var d = header(.hello, seq, t); d.append(contentsOf: Array(name.utf8.prefix(64))); return d
        case let .haptic(seq, t, kind):
            var d = header(.haptic, seq, t); d.append(kind.rawValue); return d
        }
    }

    public static func decode(_ data: Data) -> Message? {
        let b = [UInt8](data)
        guard b.count >= Wire.headerSize, b[0] == Wire.magic, let type = Wire.MsgType(rawValue: b[1]) else { return nil }
        let seq = UInt16(b[2]) | UInt16(b[3]) << 8
        let t = UInt32(b[4]) | UInt32(b[5]) << 8 | UInt32(b[6]) << 16 | UInt32(b[7]) << 24
        let body = Array(b[Wire.headerSize...])
        switch type {
        case .imu:
            guard body.count == 24 else { return nil }
            func f(_ i: Int) -> Float {
                let o = i * 4
                let bits = UInt32(body[o]) | UInt32(body[o+1]) << 8 | UInt32(body[o+2]) << 16 | UInt32(body[o+3]) << 24
                return Float(bitPattern: bits)
            }
            return .imu(seq: seq, tMs: t, gyro: SIMD3(f(0), f(1), f(2)), accel: SIMD3(f(3), f(4), f(5)))
        case .event:
            guard body.count == 1, let c = WatchEventCode(rawValue: body[0]) else { return nil }
            return .event(seq: seq, tMs: t, code: c)
        case .hello:
            guard let s = String(bytes: body, encoding: .utf8) else { return nil }
            return .hello(seq: seq, tMs: t, name: s)
        case .haptic:
            guard body.count == 1, let k = HapticKind(rawValue: body[0]) else { return nil }
            return .haptic(seq: seq, tMs: t, kind: k)
        }
    }

    /// True if u16 seq `a` is newer than `b` (wraparound-safe).
    public static func seqNewer(_ a: UInt16, than b: UInt16) -> Bool {
        a != b && (a &- b) < 0x8000
    }
}
