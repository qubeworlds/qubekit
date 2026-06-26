import { describe, expect, it } from 'vitest';
import { armForward, armInverse, type ArmParams } from '../src/index';

const P: ArmParams = {
  baseHeight: 180, shoulderOffset: 20, upperArm: 240, forearm: 220, tool: 70,
};

describe('robot arm — forward kinematics', () => {
  it('chains link lengths exactly (segment lengths preserved)', () => {
    const pts = armForward(P, 0, 0.6, -0.3, -Math.PI / 2);
    const seg = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    expect(seg(pts[1], pts[2])).toBeCloseTo(P.upperArm, 6);
    expect(seg(pts[2], pts[3])).toBeCloseTo(P.forearm, 6);
    expect(seg(pts[3], pts[4])).toBeCloseTo(P.tool, 6);
  });

  it('yaw rotates the whole arm about +y (base stays at origin)', () => {
    const a = armForward(P, 0, 0.5, -0.2, -1.2);
    const b = armForward(P, Math.PI / 2, 0.5, -0.2, -1.2);
    expect(a[0]).toEqual([0, 0, 0]);
    // a faces +z, b faces +x; heights match, planar radius preserved
    expect(b[2][1]).toBeCloseTo(a[2][1], 9); // elbow height unchanged by yaw
    expect(Math.hypot(b[2][0], b[2][2])).toBeCloseTo(Math.hypot(a[2][0], a[2][2]), 9);
  });
});

describe('robot arm — inverse kinematics (round-trips)', () => {
  it('reaches a target in the workspace exactly (tip == target)', () => {
    for (const t of [[200, 120, 260], [-180, 90, 220], [0, 60, 360], [120, 200, -140]] as const) {
      const pose = armInverse(P, [...t]);
      expect(pose.reachable).toBe(true);
      expect(pose.tip[0]).toBeCloseTo(t[0], 4);
      expect(pose.tip[1]).toBeCloseTo(t[1], 4);
      expect(pose.tip[2]).toBeCloseTo(t[2], 4);
    }
  });

  it('keeps the gripper pointing straight down (top-down grasp)', () => {
    const pose = armInverse(P, [150, 100, 200]);
    expect(pose.wrist).toBeCloseTo(-Math.PI / 2, 9); // tool axis vertical, downward
    expect(pose.tip[1]).toBeLessThan(pose.points[3][1]); // tip below the wrist
  });

  it('flags an out-of-reach target instead of faking it', () => {
    const far = armInverse(P, [900, 600, 0]); // beyond L1+L2+L3
    expect(far.reachable).toBe(false);
  });

  it('elbow-up and elbow-down are distinct branches that both hit the target', () => {
    const t: [number, number, number] = [200, 120, 200];
    const up = armInverse({ ...P, elbowUp: true }, t);
    const dn = armInverse({ ...P, elbowUp: false }, t);
    expect(up.points[2][1]).not.toBeCloseTo(dn.points[2][1], 1); // different elbow height
    expect(up.tip[1]).toBeCloseTo(dn.tip[1], 4); // same tip
  });
});
