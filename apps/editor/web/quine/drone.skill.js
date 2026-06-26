// Drone control skill — runs inside the Quine engine (QuickJS) each physics tick.
// Reads the four rotor RPMs the host pushes on input axes 1..4 and turns them
// into REAL forces on the drone body, so Jolt does the flying AND the collision
// (the rotors stop at the table instead of clipping through).
//
// Quad model (X frame, body frame: +x right, +z forward, +y up):
//   rotor i at arm point a_i; thrust f_i = kT·ω² along the body's up axis;
//   applied at a_i (off-centre → roll/pitch). Yaw is the drag-reaction couple
//   Σ spin_i·kD·ω² about the body up axis. Thrust is applied in the BODY frame
//   (rotated by the body quaternion) so a tilted craft's lift tilts with it.
(function () {
  // Calibrated to match @qubekit/solver's drone model (mass 0.3 kg): at the hover
  // RPM the four thrusts sum to weight, so the craft floats at the hover fader and
  // sinks to rest on the table below it. KT/KD = the solver's thrust/drag coeffs;
  // MAX_RPM = the model's slider max (axis 1.0 → MAX_RPM).
  var ARM = 0.11;            // motor distance from centre (m)
  var KT = 1.2e-7;           // thrust per (rad/s)²  (N)
  var KD = 2.0e-9;           // drag torque per (rad/s)²  (N·m)
  var MAX_RPM = 35500;       // axis value 1.0 maps to this (model.maxRpm)
  var TO_RADS = (2 * Math.PI) / 60;

  // body-frame rotor arm points (X layout) + spin (+1 CCW, -1 CW), matching the
  // solver/2D: 0 FR cw, 1 FL ccw, 2 RL cw, 3 RR ccw.
  var a = ARM / Math.SQRT2;
  var LY = 0.05; // rotor disc sits this far above the body centre (body frame)
  var ROTORS = [
    { p: { x:  a, y: 0, z:  a }, lift: { x:  a, y: LY, z:  a }, spin: -1 },
    { p: { x: -a, y: 0, z:  a }, lift: { x: -a, y: LY, z:  a }, spin:  1 },
    { p: { x: -a, y: 0, z: -a }, lift: { x: -a, y: LY, z: -a }, spin: -1 },
    { p: { x:  a, y: 0, z: -a }, lift: { x:  a, y: LY, z: -a }, spin:  1 },
  ];

  // rotate a body-frame vector by the body orientation quaternion q (x,y,z,w)
  function qrot(q, v) {
    var x = q.x, y = q.y, z = q.z, w = q.w;
    // t = 2 * cross(q.xyz, v)
    var tx = 2 * (y * v.z - z * v.y);
    var ty = 2 * (z * v.x - x * v.z);
    var tz = 2 * (x * v.y - y * v.x);
    // v + w*t + cross(q.xyz, t)
    return {
      x: v.x + w * tx + (y * tz - z * ty),
      y: v.y + w * ty + (z * tx - x * tz),
      z: v.z + w * tz + (x * ty - y * tx),
    };
  }

  var drone = world.get("drone");
  var rotors = [world.get("rotor0"), world.get("rotor1"), world.get("rotor2"), world.get("rotor3")];

  // Before the step: turn the four rotor RPMs into real forces on the body.
  onPreStep(function (dt) {
    var q = drone.body.rotation;            // current orientation
    var c = drone.body.position;            // world centre
    var up = qrot(q, { x: 0, y: 1, z: 0 }); // body up in world
    var yawTorque = 0;

    for (var i = 0; i < 4; i++) {
      var omega = input(i + 1) * MAX_RPM * TO_RADS; // axes 1..4 (axis 0 is reserved)
      var w2 = omega * omega;
      var thrust = KT * w2;
      var wp = qrot(q, ROTORS[i].p);          // rotor arm point in world
      var pt = { x: c.x + wp.x, y: c.y + wp.y, z: c.z + wp.z };
      drone.body.addForce({ x: up.x * thrust, y: up.y * thrust, z: up.z * thrust }, pt); // lift + roll/pitch
      yawTorque += ROTORS[i].spin * KD * w2;
    }
    drone.body.addTorque({ x: up.x * yawTorque, y: up.y * yawTorque, z: up.z * yawTorque }); // drag-reaction yaw
  });

  // After the step: stick the rotor visuals onto their final world arm points and
  // tilt them with the craft (they're free entities, not physics bodies).
  onPostStep(function () {
    var q = drone.body.rotation, c = drone.body.position;
    var rot = drone.transform.rotation; // Euler (synced from the body) for the disc tilt
    for (var i = 0; i < 4; i++) {
      var wp = qrot(q, ROTORS[i].lift);
      rotors[i].transform.position = { x: c.x + wp.x, y: c.y + wp.y, z: c.z + wp.z };
      rotors[i].transform.rotation = { x: rot.x, y: rot.y, z: rot.z };
    }
  });
})();
