// Keyboard and mouse input. Held keys are read every frame; one-shot presses
// (enter car, punch, reload, pause, mute) are queued as bit flags and taken once.
export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_RELOAD = 4;
export const ACTION_PAUSE = 8;
export const ACTION_MUTE = 16;
export const ACTION_CONFIRM = 32;
export const ACTION_MISSION = 64;

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDown = false;
  let mouseClicked = false;
  // Mouse orbit: drag to swing the camera around the player.
  let dragX = 0;
  let dragY = 0;
  let dragging = false;

  function queue(action) {
    actions |= action;
  }

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code) || event.code === 'Space' || event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      event.preventDefault();
    }
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyE') queue(ACTION_ENTER);
    else if (event.code === 'KeyF') queue(ACTION_PUNCH);
    else if (event.code === 'KeyR') queue(ACTION_RELOAD);
    else if (event.code === 'KeyP' || event.code === 'Escape') queue(ACTION_PAUSE);
    else if (event.code === 'KeyM') queue(ACTION_MUTE);
    else if (event.code === 'Enter' || event.code === 'Space') queue(ACTION_CONFIRM);
    else if (event.code === 'KeyN') queue(ACTION_MISSION);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      mouseClicked = true;
      dragging = true;
      dragX = event.clientX;
      dragY = event.clientY;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      mouseDown = false;
      dragging = false;
    }
  });
  window.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    dragX = event.clientX;
    dragY = event.clientY;
  });

  let lastDragX = 0;
  let lastDragY = 0;

  return {
    /** Forward/back/strafe as -1..1, in camera space. */
    move() {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return { forward: f, strafe: s };
    },
    running() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    jumping() {
      return keys.has('Space');
    },
    handbrake() {
      return keys.has('Space');
    },
    /** Mouse delta since last call, for orbiting the camera while dragging. */
    mouseDelta() {
      if (!dragging) {
        lastDragX = dragX;
        lastDragY = dragY;
        return { dx: 0, dy: 0 };
      }
      const dx = dragX - lastDragX;
      const dy = dragY - lastDragY;
      lastDragX = dragX;
      lastDragY = dragY;
      return { dx, dy };
    },
    /** True while the left button is held (hold to fire is not used; clicks shoot). */
    mouseHeld() {
      return mouseDown;
    },
    /** True once per click; consumed by takeClick. */
    takeClick() {
      const clicked = mouseClicked;
      mouseClicked = false;
      return clicked;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    // Test hook: let a scripted autopilot press keys without a real keyboard.
    _testPress(code) {
      keys.add(code);
    },
    _testRelease(code) {
      keys.delete(code);
    },
    _testClick() {
      mouseClicked = true;
    },
  };
}
