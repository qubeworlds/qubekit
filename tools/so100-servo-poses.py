#!/usr/bin/env python3
# Recover each SO-100 joint's TRUE servo pose from the URDF's per-link motor
# meshes, so the STS3215 instances nest into their printed pockets instead of
# floating at an arbitrary spin about the shaft.
#
#   python3 tools/so100-servo-poses.py    # prints the SERVO_POSES table for gen-so100.mjs
#
# Each parent link's `<Link>_Motor.stl` (TheRobotStudio/SO-ARM100, Apache-2.0)
# is that link's child-joint servo, posed in the PARENT link frame. The meshes
# are not vertex-identical across joints, so instead of point correspondence we
# use the two constraints the arm fixes: the shaft axis is the joint axis, and
# the shaft origin is the joint origin. That leaves per joint:
#   - a SIDE: whether the body extends along +axis or -axis (sign of the
#     centroid's axial offset), and
#   - a SPIN about the axis (azimuth of the centroid's in-plane offset —
#     the body is strongly off-axis, so this is well-conditioned).
# The canonical part mesh (sts3215.glb = Base_Motor reframed to the pan joint)
# provides the reference centroid; each pose is validated by comparing the
# transformed canonical vertices' bounding box against the target motor's.

import json
import os

import numpy as np
import trimesh

HERE = os.path.dirname(__file__)
STL = os.path.join(HERE, '..', 'so100-glb-dist', '_stl')

# joint → (parent motor STL, joint origin xyz, rpy, axis) — so100.urdf, verbatim
JOINTS = [
    ('shoulder_pan',  'Base_Motor.stl',             [0, -0.0452, 0.0165],  [1.57079, 0, 0], [0, 1, 0]),
    ('shoulder_lift', 'Rotation_Pitch_Motor.stl',   [0, 0.1025, 0.0306],   [-1.8, 0, 0],    [1, 0, 0]),
    ('elbow_flex',    'Upper_Arm_Motor.stl',        [0, 0.11257, 0.028],   [1.57079, 0, 0], [1, 0, 0]),
    ('wrist_flex',    'Lower_Arm_Motor.stl',        [0, 0.0052, 0.1349],   [-1, 0, 0],      [1, 0, 0]),
    ('wrist_roll',    'Wrist_Pitch_Roll_Motor.stl', [0, -0.0601, 0],       [0, 1.57079, 0], [0, 1, 0]),
    ('gripper',       'Fixed_Jaw_Motor.stl',        [-0.0202, -0.0244, 0], [0, 3.14158, 0], [0, 0, 1]),
]


def rpy_matrix(r, p, y):
    def rx(a): c, s = np.cos(a), np.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    def ry(a): c, s = np.cos(a), np.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    def rz(a): c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    return rz(y) @ ry(p) @ rx(r)


def align(a, b):
    """Shortest-arc rotation matrix taking unit a onto unit b."""
    v, c = np.cross(a, b), float(a @ b)
    if c > 1 - 1e-12:
        return np.eye(3)
    if c < -1 + 1e-12:
        # 180°: rotate about any axis ⊥ a
        p = np.array([1.0, 0, 0]) if abs(a[0]) < 0.9 else np.array([0, 1.0, 0])
        u = np.cross(a, p); u /= np.linalg.norm(u)
        return 2 * np.outer(u, u) - np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + c)


def rot(axis, ang):
    c, s, C = np.cos(ang), np.sin(ang), 1 - np.cos(ang)
    x, y, z = axis
    return np.array([[c + x*x*C, x*y*C - z*s, x*z*C + y*s],
                     [y*x*C + z*s, c + y*y*C, y*z*C - x*s],
                     [z*x*C - y*s, z*y*C + x*s, c + z*z*C]])


def mat_to_quat(R):
    """wxyz quaternion from a rotation matrix."""
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1) * 2
        return np.array([s/4, (R[2,1]-R[1,2])/s, (R[0,2]-R[2,0])/s, (R[1,0]-R[0,1])/s])
    i = int(np.argmax(np.diag(R)))
    j, k = (i+1) % 3, (i+2) % 3
    s = np.sqrt(R[i,i] - R[j,j] - R[k,k] + 1) * 2
    q = np.empty(4)
    q[0] = (R[k,j] - R[j,k]) / s
    q[1+i] = s / 4
    q[1+j] = (R[j,i] + R[i,j]) / s
    q[1+k] = (R[k,i] + R[i,k]) / s
    return q


def main():
    # canonical part mesh = Base_Motor in the pan servo's frame (shaft at
    # origin, +Z along the pan axis) — exactly how tools/so100-stl2glb.py
    # builds sts3215.glb.
    _, base_stl, p0, rpy0, ax0 = JOINTS[0]
    base = trimesh.load(os.path.join(STL, base_stl), force='mesh')
    R0 = rpy_matrix(*rpy0) @ align(np.array([0.0, 0, 1]), np.array(ax0, float))
    canon = (base.vertices - np.array(p0)) @ R0  # rowwise Rᵀ(v−p)
    c_can = canon.mean(axis=0)
    in_can = np.array([c_can[0], c_can[1]])  # in-plane centroid (z = shaft)

    rng = np.random.default_rng(7)
    sample = canon[rng.choice(len(canon), 400, replace=False)]

    poses = {}
    for name, stl, p, rpy, ax in JOINTS:
        mesh = trimesh.load(os.path.join(STL, stl), force='mesh')
        a = rpy_matrix(*rpy) @ np.array(ax, float)  # joint axis in PARENT frame
        p = np.array(p, float)
        d = mesh.vertices.mean(axis=0) - p
        target = mesh.vertices[rng.choice(len(mesh.vertices), 800, replace=False)]

        best = None
        # The shaft must lie ON the joint-axis LINE but the body may sit at any
        # axial offset (the joint origin is the horn interface, not the shaft
        # exit, and it differs per pocket) — an axial offset is kinematically
        # harmless (any point of the axis line is a valid pivot). Try both
        # sides; the true one wins by registration error.
        for side in (1.0, -1.0):
            Rb = align(np.array([0.0, 0, 1]), side * a)
            e1, e2 = Rb @ np.array([1.0, 0, 0]), Rb @ np.array([0.0, 1, 0])
            phi = np.arctan2(float(d @ e2), float(d @ e1)) - np.arctan2(in_can[1], in_can[0])
            R = rot(side * a, phi) @ Rb
            # axial offset: put the transformed canonical centroid at the
            # target centroid along the axis (in-plane is fixed by phi)
            t = float((d - R @ c_can) @ a)
            off = p + a * t
            moved = sample @ R.T + off
            # symmetric-ish NN error on subsamples
            dist = np.sqrt(((moved[:, None, :] - target[None, :, :]) ** 2).sum(-1)).min(1)
            err = float(dist.mean())
            if best is None or err < best['err']:
                best = {'R': R, 'off': off, 'side': side, 'phi': phi, 't': t, 'err': err}

        # refine the spin: the centroid azimuth is exact only when the target
        # mesh matches the canonical (the wrist motor variant doesn't, quite) —
        # a 1° scan around the estimate cleans that up.
        for dphi in np.arange(-30, 30.5, 1.0):
            phi = best['phi'] + np.radians(dphi)
            Rb = align(np.array([0.0, 0, 1]), best['side'] * a)
            R = rot(best['side'] * a, phi) @ Rb
            t = float((d - R @ c_can) @ a)
            off = p + a * t
            moved = sample @ R.T + off
            dist = np.sqrt(((moved[:, None, :] - target[None, :, :]) ** 2).sum(-1)).min(1)
            err = float(dist.mean())
            if err < best['err']:
                best = {'R': R, 'off': off, 'side': best['side'], 'phi': phi, 't': t, 'err': err}

        q = mat_to_quat(best['R'])
        poses[name] = {'q': [round(float(v), 9) for v in q],
                       'p': [round(float(v), 9) for v in best['off']]}
        print(f'{name:14s} side {best["side"]:+.0f}  spin {np.degrees(best["phi"]):7.1f}°  '
              f'axial off {best["t"]*1000:6.1f} mm  NN err {best["err"]*1000:5.2f} mm')

    print('\n// SERVO_POSES for tools/gen-so100.mjs (PARENT link frame, wxyz quats + positions):')
    print(json.dumps(poses, indent=2))


if __name__ == '__main__':
    main()
