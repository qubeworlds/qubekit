#!/usr/bin/env python3
# Convert the SO-ARM100's printed-part STLs into the so100 catalog's glb meshes.
#
#   python3 tools/so100-stl2glb.py            # downloads STLs, writes ./so100-glb-dist
#
# Source meshes: TheRobotStudio/SO-ARM100 (Apache-2.0), Simulation/SO100/assets.
# The STLs are in METRES, already expressed in each URDF LINK frame — which is
# exactly the catalog part's local frame (see tools/gen-so100.mjs), so the seven
# link meshes convert vertex-verbatim. The one reframed mesh is the servo:
# Base_Motor.stl is authored in the BASE link frame; we move it into the
# so100_sts3215 part's local frame (output shaft at the origin, +Z along the
# joint axis) with the inverse of the pan servo's parent-relative placement.
#
# Publish to the CDN (R2 bucket cdn-qubeworlds, the account whose bucket CORS
# publish-cdn.sh already configured) so the catalog's geometry URLs resolve:
#   for f in so100-glb-dist/*.glb; do
#     npx wrangler r2 object put "cdn-qubeworlds/qubekit/parts/so100/$(basename $f)" \
#       --file="$f" --content-type=model/gltf-binary --remote
#   done
#
# Deps: pip install trimesh numpy

import io
import os
import sys
import urllib.request

import numpy as np
import trimesh

BASE = 'https://raw.githubusercontent.com/TheRobotStudio/SO-ARM100/main/Simulation/SO100/assets'
OUT = os.path.join(os.path.dirname(__file__), '..', 'so100-glb-dist')

# STL → catalog part (the seven links convert in place; names match the
# geometry URLs emitted by gen-so100.mjs).
LINKS = {
    'Base.stl': 'base',
    'Rotation_Pitch.stl': 'shoulder',
    'Upper_Arm.stl': 'upper_arm',
    'Lower_Arm.stl': 'lower_arm',
    'Wrist_Pitch_Roll.stl': 'wrist',
    'Fixed_Jaw.stl': 'gripper',
    'Moving_Jaw.stl': 'jaw',
}
PRINT_RGBA = [1.0, 0.82, 0.12, 1.0]  # the URDF's "3d_printed" golden
MOTOR_RGBA = [0.10, 0.10, 0.11, 1.0]  # the URDF's "sts3215" black

# The pan joint (so100.urdf, verbatim) — defines the servo's frame in `base`.
PAN_XYZ = np.array([0.0, -0.0452, 0.0165])
PAN_RPY = np.array([1.57079, 0.0, 0.0])
PAN_AXIS = np.array([0.0, 1.0, 0.0])


def rpy_matrix(r, p, y):
    def rx(a): c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    def ry(a): c, s = np.cos(a), np.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    def rz(a): c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    return rz(y) @ ry(p) @ rx(r)


def align_z_to(d):
    """Rotation matrix taking +Z onto unit d (shortest arc)."""
    z = np.array([0.0, 0.0, 1.0])
    v = np.cross(z, d)
    c = float(z @ d)
    if c > 1 - 1e-12:
        return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1 / (1 + c))


def fetch(name):
    path = os.path.join(OUT, '_stl', name)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print(f'  fetching {name}')
        urllib.request.urlretrieve(f'{BASE}/{name}', path)
    return path


def load_clean(name):
    """Load an STL renderer-ready: weld (process=True) so face adjacency
    exists, force the winding consistently OUTWARD, unweld so per-vertex
    normals equal face normals (crisp CAD edges). The printed parts are thin
    OPEN shells (the base's cable opening, the gripper mouth) — the quine
    renderer honors the material's glTF `doubleSided` flag (flips the shading
    normal toward the viewer), so their interior walls light correctly with
    no extra geometry. (An earlier revision baked an inset, winding-reversed
    "inner lining" into the glbs to fake this on the pre-doubleSided engine —
    it doubled every mesh; retired when the engine shipped the flag.)

    NOTE: touch `vertex_normals` before export — trimesh only writes a NORMAL
    accessor for normals it has computed, and shipping explicit normals keeps
    the glbs loader-agnostic."""
    mesh = trimesh.load(fetch(name), force='mesh')
    trimesh.repair.fix_normals(mesh)
    mesh.unmerge_vertices()
    _ = mesh.vertex_normals
    return mesh


def export(mesh, out_name, rgba):
    mesh.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(
            baseColorFactor=rgba, metallicFactor=0.05, roughnessFactor=0.6,
            # the printed shells have real openings (wire slots, jaw mouths) a
            # viewer can see into — render their interior walls too
            doubleSided=True))
    path = os.path.join(OUT, f'{out_name}.glb')
    mesh.export(path)
    # round-trip sanity: reload and compare bounds
    back = trimesh.load(path, force='mesh')
    assert np.allclose(back.bounds, mesh.bounds, atol=1e-6), f'{out_name}: bounds drift on reload'
    print(f'  {out_name}.glb  {os.path.getsize(path)//1024} KiB  '
          f'bounds {np.round(mesh.bounds, 4).tolist()}')


def main():
    os.makedirs(OUT, exist_ok=True)
    for stl, part in LINKS.items():
        export(load_clean(stl), part, PRINT_RGBA)

    # The servo: reframe Base_Motor from the base-link frame into the part's
    # local frame (shaft exit at the origin, +Z = joint axis): v' = Rᵀ(v − p).
    motor = load_clean('Base_Motor.stl')
    R = rpy_matrix(*PAN_RPY) @ align_z_to(PAN_AXIS)
    motor.vertices = (motor.vertices - PAN_XYZ) @ R  # (v−p)·R == Rᵀ(v−p) rowwise
    export(motor, 'sts3215', MOTOR_RGBA)
    print(f'wrote {len(LINKS) + 1} glb -> {os.path.abspath(OUT)}')


if __name__ == '__main__':
    sys.exit(main())
