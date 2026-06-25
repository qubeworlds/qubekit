#!/usr/bin/env python3
"""Parametric part-mesh generator → OBJ, shipped in the preview qube.

Emits machined-metal parts (gears with teeth + hub + spokes, axles, wheels,
beams, motor) the quine engine loads as gltf-source assets. Geometry only —
colour/metalness comes from the scene entity's material (steel vs brass).

Run: python3 tools/gen-parts.py   →   apps/preview/parts/*.obj
"""
import math, os, sys

TAU = math.pi * 2

class Mesh:
    def __init__(self): self.v = []; self.f = []
    def add_v(self, x, y, z): self.v.append((x, y, z)); return len(self.v)  # 1-based
    def tri(self, a, b, c): self.f.append((a, b, c))
    def quad(self, a, b, c, d): self.f.append((a, b, c)); self.f.append((a, c, d))
    def obj(self):
        out = ["# QubeKit parametric part (generated)"]
        for (x, y, z) in self.v: out.append(f"v {x:.5f} {y:.5f} {z:.5f}")
        # flat normals per triangle so metal reads crisply
        for (a, b, c) in self.f:
            ax, ay, az = self.v[a-1]; bx, by, bz = self.v[b-1]; cx, cy, cz = self.v[c-1]
            ux, uy, uz = bx-ax, by-ay, bz-az; vx, vy, vz = cx-ax, cy-ay, cz-az
            nx, ny, nz = uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx
            l = math.sqrt(nx*nx+ny*ny+nz*nz) or 1.0
            out.append(f"vn {nx/l:.4f} {ny/l:.4f} {nz/l:.4f}")
        for i, (a, b, c) in enumerate(self.f, 1):
            out.append(f"f {a}//{i} {b}//{i} {c}//{i}")
        return "\n".join(out) + "\n"

# Metric gear standard: pitch diameter d = module · teeth (d = m·z), so pitch
# radius r = m·z/2. Meshing gears share one module → centre distance r1+r2 =
# m(z1+z2)/2, and tooth size is identical across the set. Addendum = m, dedendum
# = 1.25 m (ISO), tooth thickness ≈ half the circular pitch.
MODULE = 0.03

def gear(teeth, module=MODULE, th=0.10):
    """Involute-ish spur gear in the XY plane (metric: r = m·z/2), `teeth` teeth."""
    mesh = Mesh()
    r = module * teeth / 2.0          # pitch radius
    tip = r + 0.85 * module           # addendum (slightly short → squarer, less spiky)
    root = r - 1.0 * module           # dedendum
    hub = max(module * 1.2, r * 0.42)
    # one tooth per 2π/z: a wide flat tip land with short flanks, ~half is gap
    def rprof(a):
        seg = (a % (TAU/teeth)) / (TAU/teeth)
        if 0.30 <= seg <= 0.70: return tip
        if 0.22 <= seg < 0.30:  return root + (tip-root) * (seg-0.22)/0.08
        if 0.70 < seg <= 0.78:  return root + (tip-root) * (0.78-seg)/0.08
        return root
    m = mesh
    samples = max(96, teeth * 16)
    angs = [i/samples*TAU for i in range(samples)]
    top = [m.add_v(rprof(a)*math.cos(a), rprof(a)*math.sin(a),  th/2) for a in angs]
    bot = [m.add_v(rprof(a)*math.cos(a), rprof(a)*math.sin(a), -th/2) for a in angs]
    ctop = m.add_v(0, 0,  th/2); cbot = m.add_v(0, 0, -th/2)
    for i in range(samples):
        a, b = i, (i+1) % samples
        m.tri(ctop, top[a], top[b])         # front face
        m.tri(cbot, bot[b], bot[a])         # back face
        m.quad(bot[a], bot[b], top[b], top[a])  # rim wall
    # raised hub boss (a short cylinder) for the bolted-centre look
    hb = hub; hz = th*0.9; hn = 24
    htop = [m.add_v(hb*math.cos(i/hn*TAU), hb*math.sin(i/hn*TAU),  hz) for i in range(hn)]
    hbot = [m.add_v(hb*math.cos(i/hn*TAU), hb*math.sin(i/hn*TAU),  th/2) for i in range(hn)]
    hc = m.add_v(0, 0, hz)
    for i in range(hn):
        a, b = i, (i+1) % hn
        m.tri(hc, htop[a], htop[b]); m.quad(hbot[a], hbot[b], htop[b], htop[a])
    return m

def cylinder(r, h, n=28):
    m = Mesh()
    top = [m.add_v(r*math.cos(i/n*TAU), r*math.sin(i/n*TAU),  h/2) for i in range(n)]
    bot = [m.add_v(r*math.cos(i/n*TAU), r*math.sin(i/n*TAU), -h/2) for i in range(n)]
    ct = m.add_v(0, 0, h/2); cb = m.add_v(0, 0, -h/2)
    for i in range(n):
        a, b = i, (i+1) % n
        m.tri(ct, top[a], top[b]); m.tri(cb, bot[b], bot[a]); m.quad(bot[a], bot[b], top[b], top[a])
    return m

def box(hx, hy, hz):
    m = Mesh()
    p = [m.add_v(x*hx, y*hy, z*hz) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    # corners index: (x,y,z) → 4x+2y+z with x,y,z in {0,1}
    def c(x, y, z): return p[4*x+2*y+z]
    m.quad(c(0,0,0), c(0,1,0), c(0,1,1), c(0,0,1))  # -x
    m.quad(c(1,0,0), c(1,0,1), c(1,1,1), c(1,1,0))  # +x
    m.quad(c(0,0,0), c(0,0,1), c(1,0,1), c(1,0,0))  # -y
    m.quad(c(0,1,0), c(1,1,0), c(1,1,1), c(0,1,1))  # +y
    m.quad(c(0,0,0), c(1,0,0), c(1,1,0), c(0,1,0))  # -z
    m.quad(c(0,0,1), c(0,1,1), c(1,1,1), c(1,0,1))  # +z
    return m

def gr(teeth): return 0.12 + teeth * 0.018  # matches the preview's gearRadius

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "apps/preview/parts"); os.makedirs(out, exist_ok=True)
    parts = {}
    for t in (8, 12, 24, 36): parts[f"gear{t}"] = gear(t)
    parts["axle"]  = cylinder(0.05, 0.84)
    parts["wheel"] = cylinder(0.34, 0.18)
    parts["motor"] = box(0.16, 0.16, 0.11)
    parts["beam3"] = box(0.10, 0.04, 0.04)
    parts["beam5"] = box(0.18, 0.04, 0.04)
    parts["beam7"] = box(0.26, 0.04, 0.04)
    parts["pin"]   = cylinder(0.06, 0.12)
    for name, m in parts.items():
        open(os.path.join(out, name + ".obj"), "w").write(m.obj())
    print(f"wrote {len(parts)} parts → apps/preview/parts/:", ", ".join(sorted(parts)))

if __name__ == "__main__": main()
