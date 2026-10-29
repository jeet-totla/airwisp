import Foundation

/// One-Euro filter (Casiez et al. 2012).
public struct OneEuro {
    public var minCutoff: Double, beta: Double, dCutoff: Double
    private var xPrev: Double?, dxHat: Double = 0, xHat: Double = 0, tPrev: Double?

    public init(minCutoff: Double = 1.2, beta: Double = 0.02, dCutoff: Double = 1.0) {
        self.minCutoff = minCutoff; self.beta = beta; self.dCutoff = dCutoff
    }

    private static func alpha(_ cutoff: Double, _ dt: Double) -> Double {
        let tau = 1.0 / (2 * Double.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)
    }

    public mutating func reset() { xPrev = nil; tPrev = nil; dxHat = 0; xHat = 0 }

    public mutating func filter(_ x: Double, t: Double) -> Double {
        guard let tp = tPrev, let xp = xPrev, t > tp else {
            tPrev = t; xPrev = x; xHat = x; dxHat = 0
            return x
        }
        let dt = t - tp
        let dx = (x - xp) / dt
        let a = OneEuro.alpha(dCutoff, dt)
        dxHat = a * dx + (1 - a) * dxHat
        let cutoff = minCutoff + beta * abs(dxHat)
        let ax = OneEuro.alpha(cutoff, dt)
        xHat = ax * x + (1 - ax) * xHat
        xPrev = x; tPrev = t
        return xHat
    }
}

public struct OneEuro2D {
    private var fx: OneEuro, fy: OneEuro
    public init(minCutoff: Double = 1.2, beta: Double = 0.02, dCutoff: Double = 1.0) {
        fx = OneEuro(minCutoff: minCutoff, beta: beta, dCutoff: dCutoff)
        fy = fx
    }
    public mutating func reset() { fx.reset(); fy.reset() }
    public mutating func filter(_ x: Double, _ y: Double, t: Double) -> (Double, Double) {
        (fx.filter(x, t: t), fy.filter(y, t: t))
    }
}
