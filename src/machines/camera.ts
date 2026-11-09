import { machine } from "./machine";

/** The 3D globe's camera. Held in memory by web/src/world3d/World3D.tsx. */
export const CAMERA_STATES = ["IDLE", "HELD", "SETTLING", "FLYING"] as const;
export type CameraState = (typeof CAMERA_STATES)[number];
export type CameraEvent = "grab" | "release" | "settle" | "fly" | "land";

/** How long the camera stays put after you let go, before it follows or drifts again. */
export const SETTLE_MS = 6000;
/** For how long after you let go the world keeps drawing at full frame rate. */
export const SETTLE_BUSY_MS = 1500;

export const camera = machine<CameraState, CameraEvent>({
  name: "Camera",
  about:
    "The globe's camera. Screens steer it (useWorldFocus), selecting a train, line or station flies to it, and the player can grab it. When idle it follows your train if there is one, slowly drifts if the screen has no centre, and otherwise rests; while a details panel is open it stays on what was selected, and closing the panel flies back. The world draws at full frame rate while the camera is held, flying, or just let go; at 15 fps otherwise.",
  stored: "in memory, in web/src/world3d/World3D.tsx",
  initial: "IDLE",
  states: {
    IDLE: { about: "Following your train, drifting slowly, or resting, depending on the screen. Rests while a details panel is open.", on: { grab: "HELD", fly: "FLYING" } },
    HELD: { about: "The player is dragging or zooming.", on: { release: "SETTLING", fly: "FLYING" } },
    SETTLING: { about: `Just let go: stays where the player left it for ${SETTLE_MS / 1000} s.`, on: { settle: "IDLE", grab: "HELD", fly: "FLYING" } },
    FLYING: { about: "Animating to a new view (about 1.4 s).", on: { land: "IDLE", grab: "HELD", fly: "FLYING" } },
  },
  events: {
    grab: "The player starts dragging or zooming",
    release: "The player lets go",
    settle: `${SETTLE_MS / 1000} s pass after letting go`,
    fly: "A screen or a selection asks for a new view",
    land: "The flight ends",
  },
});
