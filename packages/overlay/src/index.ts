// @qubekit/overlay — the Build/Simulate UI, mounted over the canvas by world's
// mountScene overlay path as a hydrated component (NOT an iframe).
//
// Exports the overlay entry the host dynamically imports:
//   export async function mount(el: HTMLElement, host: unknown): Promise<{ unmount?: () => void }>
//
// Svelte 5 runes, dark theme, TOUCH-FIRST: every interaction has a gesture
// (drag-to-place, long-press, rotate handle, two-finger orbit/pan/zoom). iPad is
// the editing floor; the run layout collapses to a phone. No hover-only paths.
//
// TODO(Phase 5/6): parts palette, snap placement, gizmos, multiplayer cursors.

export {};
