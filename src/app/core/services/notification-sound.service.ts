import { DestroyRef, Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

/** localStorage key — '1' = on, '0' = off, absent/unreadable = default (on). */
const STORAGE_KEY = 'siriedu.notificationSoundEnabled';

/**
 * Minimum gap between two chimes. SSE push and the poll timer can both report the same arrival
 * within moments of each other, and a burst of arrivals must not turn into a ringing phone.
 */
export const NOTIFICATION_SOUND_THROTTLE_MS = 1500;

/**
 * A chime whose context had to be resumed first is dropped if the resume only completes later
 * than this — otherwise a notification that arrived while the tab was still waiting for its
 * first user gesture would ring out of nowhere minutes later, on the reader's first click.
 */
const STALE_RESUME_MS = 2000;

/** Peak gain of one note. Low-to-mid so the chime is noticeable but never harsh. */
const PEAK_GAIN = 0.15;
/** Attack ramp — prevents the click an instant jump from silence would make. */
const ATTACK_S = 0.015;
/** exponentialRamp cannot reach 0, so notes decay to this (about -80 dB) and are then stopped. */
const SILENCE_GAIN = 0.0001;
/** Scheduling lead so the first note never starts "in the past" of the context clock. */
const START_LEAD_S = 0.01;

/** Two-note ascending "ding-dong" (A5 → D6), about 0.4s end to end. */
const CHIME_NOTES: ReadonlyArray<{ frequency: number; offset: number; duration: number }> = [
  { frequency: 880, offset: 0, duration: 0.22 },
  { frequency: 1174.66, offset: 0.14, duration: 0.26 },
];

/**
 * Events that count as the reader's first interaction. `pointerdown`/`keydown` unlock desktop
 * browsers; iOS Safari only honours a gesture that ends (`touchend`/`pointerup`), which is why
 * the unlock listeners are removed only once the context is really running.
 */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend'] as const;

export type NotificationSoundAudioContextFactory = () => AudioContext | null;

/**
 * Test seam (same idea as `NOTIFICATION_STREAM_FETCH`): where the service gets its
 * `AudioContext`. A token — not the global — so specs inject a fake and never make real sound.
 * Returns null when the platform has no Web Audio at all (SSR, old browsers).
 */
export const NOTIFICATION_SOUND_AUDIO_CONTEXT_FACTORY = new InjectionToken<NotificationSoundAudioContextFactory>(
  'NOTIFICATION_SOUND_AUDIO_CONTEXT_FACTORY',
  {
    providedIn: 'root',
    factory: () => () => {
      const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
      return Ctor ? new Ctor() : null;
    },
  },
);

/**
 * Feature request: a sound when a new notification arrives (the toast pops).
 *
 * The chime is synthesised with the Web Audio API — no audio asset to ship or cache. The service
 * is deliberately silent-by-failure: autoplay policy, a missing `AudioContext`, a suspended
 * context or a throwing `localStorage` must never surface as an error, because a missing "ding"
 * is a far smaller problem than a broken notification toast.
 *
 * Browsers refuse to make sound before the reader has interacted with the page, so the context
 * is created/resumed lazily and primed by a one-shot unlock listener on the first interaction.
 * Until then (a notification arrives on a page nobody has touched yet) `play()` is a silent no-op.
 */
@Injectable({ providedIn: 'root' })
export class NotificationSoundService {
  private readonly createContext = inject(NOTIFICATION_SOUND_AUDIO_CONTEXT_FACTORY);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _enabled = signal<boolean>(this.loadInitialEnabled());
  /** Whether new-notification chimes are on. Default on; the choice persists per browser. */
  readonly enabled = this._enabled.asReadonly();

  private context: AudioContext | null = null;
  /** Set when the factory returned null — the platform has no Web Audio, never ask again. */
  private contextUnsupported = false;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private lastChimeAt = Number.NEGATIVE_INFINITY;
  private removeUnlockListeners: (() => void) | null = null;

  constructor() {
    this.installUnlockListeners();
  }

  setEnabled(value: boolean): void {
    this._enabled.set(value);
    this.persist(value);
  }

  /** Flips the setting and returns the new value. */
  toggle(): boolean {
    this.setEnabled(!this._enabled());
    return this._enabled();
  }

  /** Chime for a new notification. No-op when off, throttled, or the browser forbids sound. Never throws. */
  play(): void {
    this.trigger(false);
  }

  /**
   * Sample chime for the on/off toggle so the reader hears the volume. Skips the throttle (it is a
   * deliberate click, not an arrival burst) but still respects `enabled`. Never throws.
   */
  preview(): void {
    this.trigger(true);
  }

  private trigger(bypassThrottle: boolean): void {
    try {
      if (!this._enabled()) return;
      const now = Date.now();
      if (!bypassThrottle && now - this.lastAttemptAt < NOTIFICATION_SOUND_THROTTLE_MS) return;
      this.lastAttemptAt = now;

      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'running') {
        this.chime(ctx);
        return;
      }
      this.resumeThenChime(ctx, now);
    } catch {
      // Sound is a nicety — never let it break the caller (the toast flow, a click handler).
    }
  }

  private resumeThenChime(ctx: AudioContext, attemptAt: number): void {
    Promise.resolve(ctx.resume()).then(
      () => {
        try {
          if (!this._enabled() || ctx.state !== 'running') return;
          if (Date.now() - attemptAt > STALE_RESUME_MS) return;
          if (this.lastChimeAt >= attemptAt) return; // a later attempt already rang for this burst
          this.chime(ctx);
        } catch {
          // silent
        }
      },
      () => {
        // Autoplay still blocked — stay silent rather than spam the console.
      },
    );
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (this.contextUnsupported) return null;
    try {
      this.context = this.createContext();
    } catch {
      this.context = null;
      return null; // transient failure — try again on the next call
    }
    if (!this.context) this.contextUnsupported = true;
    return this.context;
  }

  private chime(ctx: AudioContext): void {
    this.lastChimeAt = Date.now();
    const start = ctx.currentTime + START_LEAD_S;
    for (const note of CHIME_NOTES) {
      const noteStart = start + note.offset;
      const noteEnd = noteStart + note.duration;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, noteStart + ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(SILENCE_GAIN, noteEnd);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    }
  }

  private installUnlockListeners(): void {
    if (!this.isBrowser) return;
    const target = this.document;
    const options: AddEventListenerOptions = { capture: true, passive: true };
    const handler = (): void => this.prime();
    for (const type of UNLOCK_EVENTS) target.addEventListener(type, handler, options);
    this.removeUnlockListeners = () => {
      for (const type of UNLOCK_EVENTS) target.removeEventListener(type, handler, options);
      this.removeUnlockListeners = null;
    };
    this.destroyRef.onDestroy(() => this.removeUnlockListeners?.());
  }

  /**
   * First-interaction unlock: create + resume the context inside the gesture so later chimes
   * (which happen outside any gesture) are allowed to start. Skipped while sound is off — a
   * reader who muted it never needs a context, and enabling it later is itself a gesture
   * (`preview()` from the toggle). The listeners stay until the context is genuinely running.
   */
  private prime(): void {
    try {
      if (!this._enabled()) return;
      const ctx = this.ensureContext();
      if (!ctx || ctx.state === 'running') {
        this.removeUnlockListeners?.();
        return;
      }
      Promise.resolve(ctx.resume()).then(
        () => {
          if (ctx.state === 'running') this.removeUnlockListeners?.();
        },
        () => {
          // Not allowed yet (e.g. a touchstart on iOS) — keep listening for the next gesture.
        },
      );
    } catch {
      // silent
    }
  }

  private loadInitialEnabled(): boolean {
    try {
      if (typeof localStorage === 'undefined') return true;
      return localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
      return true;
    }
  }

  private persist(value: boolean): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignore — the setting simply won't survive a reload
    }
  }
}
