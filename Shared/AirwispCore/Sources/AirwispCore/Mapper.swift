import Foundation

@inline(__always) func clamp01(_ v: Double) -> Double { min(1, max(0, v)) }

public struct Point: Equatable { public var x: Double, y: Double; public init(_ x: Double, _ y: Double) { self.x = x; self.y = y } }

/// Active-zone mapper with optional 4-corner bilinear calibration.
public struct Mapper {
    public var zoneX = 0.2, zoneY = 0.25, zoneW = 0.6, zoneH = 0.5
    public var mirrorX = true
    /// Corners TL, TR, BL, BR in mirrored camera space, or nil.
    public private(set) var corners: [Point]?

    public init() {}

    public mutating func setCorners(tl: Point, tr: Point, bl: Point, br: Point) {
        let m: (Point) -> Point = mirrorX ? { Point(1 - $0.x, $0.y) } : { $0 }
        corners = [m(tl), m(tr), m(bl), m(br)]
    }
    public mutating func clearCalibration() { corners = nil }

    /// Camera-normalized (origin top-left, un-mirrored) -> screen unit square.
    public func toUnit(_ cx: Double, _ cy: Double) -> Point {
        let x = mirrorX ? 1 - cx : cx
        guard let c = corners else {
            return Point(clamp01((x - zoneX) / zoneW), clamp01((cy - zoneY) / zoneH))
        }
        return inverseBilinear(x, cy, c)
    }

    private func inverseBilinear(_ px: Double, _ py: Double, _ c: [Point]) -> Point {
        let tl = c[0], tr = c[1], bl = c[2], br = c[3]
        var u = 0.5, v = 0.5
        for _ in 0..<20 {
            let fx = (1-u)*(1-v)*tl.x + u*(1-v)*tr.x + (1-u)*v*bl.x + u*v*br.x - px
            let fy = (1-u)*(1-v)*tl.y + u*(1-v)*tr.y + (1-u)*v*bl.y + u*v*br.y - py
            let dxu = (1-v)*(tr.x-tl.x) + v*(br.x-bl.x)
            let dxv = (1-u)*(bl.x-tl.x) + u*(br.x-tr.x)
            let dyu = (1-v)*(tr.y-tl.y) + v*(br.y-bl.y)
            let dyv = (1-u)*(bl.y-tl.y) + u*(br.y-tr.y)
            let det = dxu*dyv - dxv*dyu
            if abs(det) < 1e-12 { break }
            let du = (fx*dyv - fy*dxv) / det
            let dv = (dxu*fy - dyu*fx) / det
            u -= du; v -= dv
            if abs(du) < 1e-7 && abs(dv) < 1e-7 { break }
        }
        return Point(clamp01(u), clamp01(v))
    }
}
