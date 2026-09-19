export interface InputIntent {
  forward: number;
  right: number;
  jump: boolean;
  jumpHeld: boolean;
  sprint: boolean;
  crouch: boolean;
  fire: boolean;
  firePressed: boolean;
  aim: boolean;
  reload: boolean;
  interact: boolean;
  interactHeld: boolean;
  switchTo: 1 | 2 | 3 | 4 | null;
  cycleDir: 1 | -1 | 0;
  useMedical: boolean;
  useMedicalAlt: boolean;
  nextWeapon: boolean;
  lookX: number;
  lookY: number;
}

const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'crouch',
  KeyC: 'crouch',
  KeyR: 'reload',
  KeyE: 'interact',
  Digit1: 'slot1',
  Digit2: 'slot2',
  Digit3: 'slot3',
  Digit4: 'slot4',
  KeyQ: 'nextWeapon',
  KeyF: 'useMedical',
  KeyG: 'useMedicalAlt',
} as const;

type Action = (typeof KEY_MAP)[keyof typeof KEY_MAP];

export class InputSystem {
  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private mouseDx = 0;
  private mouseDy = 0;
  private mouseLeft = false;
  private mouseLeftPressed = false;
  private mouseRight = false;
  private wheel = 0;
  private usingPointerEvents = false;
  private lockAttempts = 0;
  private lockRetryTimer = 0;

  sensitivity = 0.0022;
  sensitivityScale = 1;
  invertY = false;
  locked = false;

  private canvas: HTMLElement | null = null;
  private onEscape: (() => void) | null = null;
  private onLockChange: ((locked: boolean) => void) | null = null;
  private onDebugToggle: (() => void) | null = null;
  private enabled = true;
  private bound = false;

  private readonly handlers = {
    keydown: (e: KeyboardEvent) => this.handleKeyDown(e),
    keyup: (e: KeyboardEvent) => this.handleKeyUp(e),
    pointermove: (e: PointerEvent) => this.handlePointerMove(e),
    mousemove: (e: MouseEvent) => this.handleMouseMove(e),
    mousedown: (e: MouseEvent) => this.handleMouseDown(e),
    mouseup: (e: MouseEvent) => this.handleMouseUp(e),
    wheel: (e: WheelEvent) => this.handleWheel(e),
    contextmenu: (e: Event) => e.preventDefault(),
    pointerlockchange: () => this.handleLockChange(),
    blur: () => this.releaseAll(),
  };

  attach(canvas: HTMLElement): void {
    this.canvas = canvas;
    if (this.bound) return;
    this.bound = true;
    window.addEventListener('keydown', this.handlers.keydown);
    window.addEventListener('keyup', this.handlers.keyup);
    // pointermove exposes coalesced sub-frame samples; mousemove is kept as
    // a fallback for environments that do not deliver pointer events.
    window.addEventListener('pointermove', this.handlers.pointermove);
    window.addEventListener('mousemove', this.handlers.mousemove);
    window.addEventListener('mousedown', this.handlers.mousedown);
    window.addEventListener('mouseup', this.handlers.mouseup);
    window.addEventListener('wheel', this.handlers.wheel, { passive: true });
    window.addEventListener('blur', this.handlers.blur);
    document.addEventListener('contextmenu', this.handlers.contextmenu);
    document.addEventListener('pointerlockchange', this.handlers.pointerlockchange);
  }

  dispose(): void {
    if (!this.bound) return;
    this.bound = false;
    window.clearTimeout(this.lockRetryTimer);
    window.removeEventListener('keydown', this.handlers.keydown);
    window.removeEventListener('keyup', this.handlers.keyup);
    window.removeEventListener('pointermove', this.handlers.pointermove);
    window.removeEventListener('mousemove', this.handlers.mousemove);
    window.removeEventListener('mousedown', this.handlers.mousedown);
    window.removeEventListener('mouseup', this.handlers.mouseup);
    window.removeEventListener('wheel', this.handlers.wheel);
    window.removeEventListener('blur', this.handlers.blur);
    document.removeEventListener('contextmenu', this.handlers.contextmenu);
    document.removeEventListener('pointerlockchange', this.handlers.pointerlockchange);
  }

  setCallbacks(cb: {
    onEscape?: () => void;
    onLockChange?: (locked: boolean) => void;
    onDebugToggle?: () => void;
  }): void {
    this.onEscape = cb.onEscape ?? null;
    this.onLockChange = cb.onLockChange ?? null;
    this.onDebugToggle = cb.onDebugToggle ?? null;
  }

  /**
   * Verification hook: pointer lock cannot be granted without a real user
   * gesture, so tests force the locked state to exercise the true look path.
   */
  __forceLocked(v: boolean): void {
    this.locked = v;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.releaseAll();
  }

  requestLock(): void {
    const el = this.canvas;
    if (!el || document.pointerLockElement === el) return;

    // Chromium rejects a pointer-lock request made too soon after
    // exitPointerLock(), which is exactly the death -> Restart path. Retry a
    // few times so the cursor is actually recaptured instead of the player
    // being left with a dead mouse in-game.
    this.lockAttempts = 0;
    this.tryLock();
  }

  private tryLock(): void {
    const el = this.canvas;
    if (!el || document.pointerLockElement === el) return;
    if (this.lockAttempts >= 12) return;
    this.lockAttempts++;

    let promise: Promise<void> | undefined;
    try {
      promise = el.requestPointerLock?.({ unadjustedMovement: true } as PointerLockOptions) as
        | Promise<void>
        | undefined;
    } catch {
      promise = undefined;
    }

    const retry = () => {
      if (document.pointerLockElement === el) return;
      window.clearTimeout(this.lockRetryTimer);
      this.lockRetryTimer = window.setTimeout(() => this.tryLock(), 120);
    };

    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        // unadjustedMovement is not supported everywhere; fall back to a
        // plain request before giving up on this attempt.
        try {
          const plain = el.requestPointerLock() as unknown as Promise<void> | undefined;
          if (plain && typeof plain.catch === 'function') plain.catch(retry);
          else retry();
        } catch {
          retry();
        }
      });
    } else {
      retry();
    }
  }

  releaseLock(): void {
    this.lockAttempts = 99;
    window.clearTimeout(this.lockRetryTimer);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private handleLockChange(): void {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) window.clearTimeout(this.lockRetryTimer);
    if (!this.locked) this.releaseAll();
    this.onLockChange?.(this.locked);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'F3' || e.code === 'Backquote') {
      e.preventDefault();
      this.onDebugToggle?.();
      return;
    }
    if (e.code === 'Escape') {
      this.onEscape?.();
      return;
    }
    if (e.code === 'F11' || e.code === 'F12') return;
    const action = KEY_MAP[e.code as keyof typeof KEY_MAP];
    if (!action) return;
    e.preventDefault();
    if (!e.repeat) this.pressed.add(action);
    this.held.add(action);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const action = KEY_MAP[e.code as keyof typeof KEY_MAP];
    if (!action) return;
    this.held.delete(action);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.locked) return;
    this.usingPointerEvents = true;

    // A single pointermove can stand for several hardware samples. Summing
    // the coalesced list keeps every sample exactly once, so fast flicks do
    // not lose motion and slow moves do not arrive in uneven clumps.
    const coalesced = e.getCoalescedEvents?.();
    if (coalesced && coalesced.length > 0) {
      for (const c of coalesced) {
        this.mouseDx += c.movementX;
        this.mouseDy += c.movementY;
      }
      return;
    }
    this.mouseDx += e.movementX;
    this.mouseDy += e.movementY;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.locked) return;
    // pointermove already accounted for this motion.
    if (this.usingPointerEvents) return;
    this.mouseDx += e.movementX;
    this.mouseDy += e.movementY;
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.locked) return;
    if (e.button === 0) {
      this.mouseLeft = true;
      this.mouseLeftPressed = true;
    } else if (e.button === 2) {
      this.mouseRight = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.mouseLeft = false;
    else if (e.button === 2) this.mouseRight = false;
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.locked) return;
    this.wheel += e.deltaY;
  }

  private releaseAll(): void {
    this.held.clear();
    this.pressed.clear();
    this.mouseLeft = false;
    this.mouseRight = false;
    this.mouseLeftPressed = false;
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.wheel = 0;
  }

  consume(out: InputIntent): InputIntent {
    const on = this.enabled && this.locked;
    const held = (a: Action) => (on && this.held.has(a) ? 1 : 0);

    out.forward = on ? held('forward') - held('back') : 0;
    out.right = on ? held('right') - held('left') : 0;
    out.jumpHeld = held('jump') === 1;
    out.jump = on && this.pressed.has('jump');
    out.sprint = held('sprint') === 1;
    out.crouch = held('crouch') === 1;
    out.reload = on && this.pressed.has('reload');
    out.interact = on && this.pressed.has('interact');
    out.interactHeld = held('interact') === 1;
    out.nextWeapon = on && (this.pressed.has('nextWeapon') || this.wheel !== 0);
    out.cycleDir = on && this.wheel !== 0 ? (this.wheel > 0 ? 1 : -1) : 0;
    out.switchTo = !on
      ? null
      : this.pressed.has('slot1')
        ? 1
        : this.pressed.has('slot2')
          ? 2
          : this.pressed.has('slot3')
            ? 3
            : this.pressed.has('slot4')
              ? 4
              : null;
    out.useMedical = on && this.pressed.has('useMedical');
    out.useMedicalAlt = on && this.pressed.has('useMedicalAlt');
    out.fire = on && this.mouseLeft;
    out.firePressed = on && this.mouseLeftPressed;
    out.aim = on && this.mouseRight;

    const sy = this.invertY ? -1 : 1;
    const scale = this.sensitivity * this.sensitivityScale;
    out.lookX = on ? this.mouseDx * scale : 0;
    out.lookY = on ? this.mouseDy * scale * sy : 0;

    this.pressed.clear();
    this.mouseLeftPressed = false;
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.wheel = 0;
    return out;
  }

  static createIntent(): InputIntent {
    return {
      forward: 0,
      right: 0,
      jump: false,
      jumpHeld: false,
      sprint: false,
      crouch: false,
      fire: false,
      firePressed: false,
      aim: false,
      reload: false,
      interact: false,
      interactHeld: false,
      switchTo: null,
      cycleDir: 0,
      useMedical: false,
      useMedicalAlt: false,
      nextWeapon: false,
      lookX: 0,
      lookY: 0,
    };
  }
}
