# Virtual Construction Kit for Quine, Q64, and Qubepods

## 1. Concept

A virtual construction kit for Qubeworlds would be a multiplayer mechanical sandbox where users assemble bricks, beams, gears, axles, motors, sensors, panels, and programmable logic into working machines.

It should not be positioned commercially as “Lego” or “fischertechnik”, but as an original programmable construction environment inspired by physical construction toys.

Possible product names:

- QubeKit
- Quine Kit
- Mechanica
- QubeWorks
- Qubrix
- Taluvi Construction Lab

The core idea:

> A programmable mechanical construction environment where physical toys, CAD, games, education, and AI-assisted world-building overlap.

---

## 2. User Experience

The player enters a Qubeworlds scene and sees a construction palette.

```text
Parts
 ├─ Bricks
 ├─ Plates
 ├─ Beams
 ├─ Axles
 ├─ Pins
 ├─ Gears
 ├─ Wheels
 ├─ Hinges
 ├─ Motors
 ├─ Sensors
 ├─ Logic blocks
 └─ Decorative shells
```

Users drag parts into the world. When a part approaches another compatible part, Quine shows snap previews.

Example snap types:

- stud-to-hole
- pin-to-beam
- axle-to-bearing
- gear-to-gear
- hinge-to-hinge
- wheel-to-axle
- electrical connector-to-connector
- logic output-to-input

The important mechanic is not just grid snapping. It is semantic snapping.

A beam is not just a mesh. It has connection points, allowed rotations, mechanical behavior, load rules, and optional electrical or signal channels.

---

## 3. Build Mode and Simulate Mode

### Build Mode

Build mode is precise, CAD-like, but still playful.

Features:

- grid snapping
- semantic part snapping
- ghost previews
- collision-aware placement
- undo and redo
- clone part
- clone subassembly
- symmetry tools
- exploded view
- multiplayer cursors
- placement history
- versioned assemblies

### Simulate Mode

In simulate mode, the construction becomes active.

Features:

- gravity
- rigid-body physics
- rotating axles
- hinges
- gear ratios
- motors
- wheels
- friction
- sensors
- programmable controllers
- collision detection
- optional stress or breakage simulation

This is where Quine becomes more than a renderer. It becomes a live mechanical world engine.

---

## 4. Role of Quine

Quine handles the real-time world layer.

```text
Quine
 ├─ scene graph / ECS
 ├─ rendering
 ├─ physics integration
 ├─ snapping previews
 ├─ constraint visualization
 ├─ multiplayer replication
 ├─ object picking
 ├─ camera control
 ├─ asset streaming
 └─ QView UI overlays
```

Rendering options:

- instanced meshes for common parts
- glTF assets for high-quality parts
- KTX2 textures for compressed materials
- SDF or procedural previews for parametric parts
- meshlets / LOD for large constructions
- HTML / QView overlays for inspectors and forms

The visual layer should feel like a 3D toy editor. Internally, every part is a semantic object.

---

## 5. Role of Q64

Q64 defines parts, constraints, controllers, and deterministic simulation logic.

A part is not just data. It is a typed component with declared ports and behaviors.

Example direction:

```q64
module dev.q64.qubekit.parts

pub part Beam5 {
    geometry = "beam_5.glb"

    snap hole[5] : PinSocket {
        spacing = 8.mm
        axis = Axis.X
    }

    snap axle[5] : AxleBearing {
        spacing = 8.mm
        axis = Axis.X
        diameter = 4.mm
    }

    mass = 12.g
    material = Plastic
}
```

A gear could declare mechanical behavior:

```q64
pub part Gear24 {
    geometry = "gear_24.glb"

    snap center : AxleSocket {
        axis = Axis.Z
    }

    gear teeth = 24 {
        module = 1.0
        pressure_angle = 20.deg
    }

    mass = 4.g
}
```

A motor:

```q64
pub part Motor {
    snap axle_out : AxleSocket {
        axis = Axis.Z
        driven = true
    }

    input power : Electric
    input speed : Signal<f32>

    torque = 0.2.Nm
    max_rpm = 600
}
```

A programmable controller:

```q64
pub component BlinkMotor {
    input tick : Time
    output motor_speed : Signal<f32>

    state phase : f32 = 0.0

    fn update(dt: f32) @realtime {
        phase += dt
        motor_speed = sin(phase * 4.0) * 0.8
    }
}
```

Q64 is a strong fit because it can provide:

- typed part definitions
- safe real-time code
- deterministic simulation behavior
- WIT component interfaces
- compile-time validation of ports and constraints
- runtime-safe user scripting

---

## 6. Core Data Model

Every part instance needs a stable identity and typed behavior.

```text
World
 └─ Assembly
     ├─ PartInstance
     │   ├─ object_id
     │   ├─ part_type
     │   ├─ transform
     │   ├─ material
     │   ├─ owner
     │   └─ snap ports
     │
     ├─ Connection
     │   ├─ from_part
     │   ├─ from_port
     │   ├─ to_part
     │   ├─ to_port
     │   └─ constraint_type
     │
     └─ Controller
         ├─ q64_module
         ├─ inputs
         └─ outputs
```

Connections should be first-class objects.

Connection types:

```text
PinConnection
AxleConnection
GearMeshConnection
HingeConnection
RigidStudConnection
ElectricConnection
SignalConnection
```

This gives the system deterministic multiplayer behavior. Instead of synchronizing arbitrary mesh transforms, the system synchronizes construction operations and validated constraints.

---

## 7. Snap Ports

The snap system is the product.

A snap port defines where and how a part can connect.

```text
SnapPort
 ├─ local position
 ├─ local axis
 ├─ allowed counterpart types
 ├─ allowed rotations
 ├─ tolerance
 ├─ generated constraint
 ├─ visual ghost
 └─ optional behavior
```

Example compatibility:

```text
Beam hole accepts:
 ├─ pin
 ├─ axle
 ├─ screw
 └─ sensor mount

Axle socket accepts:
 ├─ axle
 ├─ motor output
 ├─ wheel hub
 └─ gear center
```

When the user moves a part, Quine asks:

```text
Which snap ports are compatible?
Which transform aligns them?
Would placement collide?
Would it over-constrain the assembly?
Is this legal in build mode?
```

Then Quine displays the best valid ghost transform.

---

## 8. Physics and Mechanical Simulation

The first version should avoid full microscopic physical simulation. Gears do not need tooth-by-tooth collision. They can be simulated symbolically.

Minimum simulation stack:

```text
1. Structural constraints
2. Kinematic constraints
3. Symbolic gear and axle graph
4. Rigid-body physics for visible motion
5. Optional collision and stress layer
```

Example gear relationship:

```text
Gear A: 12 teeth
Gear B: 24 teeth

rpm_B = -rpm_A * 12 / 24
torque_B = torque_A * 24 / 12
```

This is cheaper, more stable, and better for deterministic multiplayer.

Minimum mechanical features:

- rigid bodies
- fixed joints
- hinges
- axles
- gear ratios
- motors
- wheel friction
- simple sensors

Later features:

- belts
- springs
- suspension
- pneumatics
- cables
- load and stress
- breakage
- soft bodies
- fluid interaction

---

## 9. Multiplayer by Default

The construction kit should be collaborative from the beginning.

Users see each other’s tools and cursors:

```text
Mat is placing Beam5
Anna is editing MotorController
Leo is testing the rover
```

The authoritative state should live server-side.

```text
Browser / iPad
 └─ Quine client
     ├─ local prediction
     ├─ snap preview
     └─ input events

Qubepods
 └─ world runner
     ├─ validates placement
     ├─ resolves constraints
     ├─ simulates world
     ├─ emits deltas
     └─ persists assembly
```

The system should replicate operations, not raw world snapshots.

Operation examples:

```text
PlacePart
MovePart
ConnectPorts
DisconnectPorts
SetMotorSpeed
EditController
DeletePart
GroupAsSubassembly
PublishAssembly
```

This enables:

- replay
- undo and redo
- audit trail
- multiplayer conflict resolution
- save and load
- version control
- publishing to marketplace

---

## 10. Role of Qubepods

Qubepods becomes the hosting, publishing, and collaboration layer.

```text
Qubepods
 ├─ hosts the world
 ├─ hosts the assembly state
 ├─ runs authoritative simulation
 ├─ stores assets
 ├─ stores metadata
 ├─ routes multiplayer sessions
 ├─ publishes kits
 ├─ manages identity through Taluvi ID
 └─ exposes WIT interfaces for tools, AI, and services
```

A construction project could be a Qubepod.

```text
qubepods.com/mat/rover-kit
qubepods.com/school/mechanics-class
qubepods.com/qubeworlds/mars-factory
```

Project structure:

```text
project.jsonc
parts/
assemblies/
controllers/
textures/
world.q64
wit/
```

Example descriptor:

```jsonc
{
  "name": "mars-rover-kit",
  "type": "qubekit.world",

  "parts": [
    "dev.q64.qubekit.beams",
    "dev.q64.qubekit.gears",
    "dev.q64.qubekit.motors"
  ],

  "runtime": {
    "mode": "stateful",
    "multiplayer": true,
    "tick_hz": 30
  },

  "storage": {
    "assets": "r2",
    "state": "d1"
  }
}
```

---

## 11. AI Integration

The AI should generate valid assemblies, not arbitrary meshes.

Example prompt:

> Build me a small two-wheel robot with a front sensor.

The AI emits an assembly graph:

```text
Place Beam7
Attach MotorLeft to hole 2
Attach MotorRight to hole 6
Attach Wheel to left motor axle
Attach Wheel to right motor axle
Attach SensorFront to beam front
Connect Controller output to motors
```

Then Quine visualizes the result and the user can edit it.

AI use cases:

- part search
- automatic assembly generation
- debugging broken mechanisms
- explaining why a machine does not move
- suggesting reinforcement
- optimizing weight
- generating Q64 controller code
- converting an assembly into a published kit
- generating lessons for schools or makers

---

## 12. Educational Layer

This could become a strong educational product.

Example lessons:

```text
Lesson 1: Build a lever
Lesson 2: Build a gear train
Lesson 3: Build a steering mechanism
Lesson 4: Build a walking robot
Lesson 5: Add a sensor
Lesson 6: Program a controller with blocks
Lesson 7: Inspect the generated Q64
```

Programming levels:

```text
No code:
    drag wires and logic blocks

Blocks:
    visual Scratch-like controller

Q64:
    real typed code for advanced users
```

This gives the platform a path from play to engineering.

---

## 13. MVP Proposal

Do not start with the full construction universe.

Start with a narrow, expressive kit.

### MVP: Multiplayer Rover Builder

Parts:

```text
Beam3
Beam5
Beam7
Pin
Axle
Wheel
Gear12
Gear24
Motor
Battery
DistanceSensor
Controller
Plate
```

Features:

```text
snap placement
basic physics
motor control
gear ratio simulation
multiplayer editing
save/load
publish project
simple Q64 controller
```

Demo goal:

> Two users collaboratively build a small rover, program it in Q64, simulate it, drive it in Quine, and publish it as a Qubepod.

This is small enough to implement but expressive enough to show the full stack.

---

## 14. Architecture Sketch

```text
┌─────────────────────────────────────────────┐
│ Browser / iPad PWA                           │
│                                             │
│  Quine                                      │
│  ├─ 3D renderer                             │
│  ├─ object picking                          │
│  ├─ snap preview                            │
│  ├─ local simulation preview                │
│  └─ QView UI overlays                       │
│                                             │
│  Q64 runtime                                │
│  ├─ controllers                             │
│  ├─ validation                              │
│  └─ generated WIT bindings                  │
└─────────────────────────────────────────────┘
                    │
                    │ events / deltas
                    ▼
┌─────────────────────────────────────────────┐
│ Qubepods world runner                        │
│                                             │
│  ├─ authoritative assembly graph             │
│  ├─ multiplayer session                      │
│  ├─ constraint solver                        │
│  ├─ physics / kinematic simulation           │
│  ├─ persistence                              │
│  ├─ publishing                               │
│  └─ AI gateway                               │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│ Taluvi / Cloud layer                         │
│                                             │
│  ├─ Taluvi ID                                │
│  ├─ billing                                  │
│  ├─ storage                                  │
│  ├─ asset registry                           │
│  ├─ logging / tracing                        │
│  └─ marketplace                              │
└─────────────────────────────────────────────┘
```

---

## 15. Why This Fits the Stack

### Quine

Good for:

- live 3D construction
- object picking
- rendering
- physics
- snapping previews
- multiplayer worlds
- SDF and procedural geometry

### Q64

Good for:

- typed part definitions
- deterministic controllers
- safe real-time code
- simulation graphs
- WIT interfaces
- reusable part packages

### Qubepods

Good for:

- hosted multiplayer sessions
- project publishing
- asset storage
- identity-aware collaboration
- AI-assisted building
- marketplace distribution

---

## 16. Strategic Value

This could become a flagship Qubeworlds demo because it demonstrates the whole platform:

```text
3D world
multiplayer
object system
physics
Q64 scripting
Wasm components
AI assistance
publishing
marketplace
education
```

It is also more bounded than building a huge open-world game first. A construction kit has constrained geometry, clear rules, reusable components, and a strong reason for users to create and publish content.

The best first demo:

> Build a rover together in the browser, program it in Q64, drive it in Quine, and publish it on Qubepods.
