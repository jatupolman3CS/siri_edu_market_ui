import { TestBed } from '@angular/core/testing';
import {
  NOTIFICATION_SOUND_AUDIO_CONTEXT_FACTORY,
  NOTIFICATION_SOUND_THROTTLE_MS,
  NotificationSoundService,
} from './notification-sound.service';

const STORAGE_KEY = 'siriedu.notificationSoundEnabled';

/**
 * The runner's Node exposes a `localStorage` global that is `undefined` without a backing file, so
 * (like `auth.service.spec.ts`) the spec brings its own in-memory one instead of trusting the host.
 */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

/**
 * Feature request: a sound when a new notification arrives.
 *
 * Every test injects a fake `AudioContext` through `NOTIFICATION_SOUND_AUDIO_CONTEXT_FACTORY`, so
 * no spec ever touches the runner's real Web Audio (or makes real sound). Time is driven with
 * fake timers because the throttle reads `Date.now()`.
 */
interface FakeOscillator {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

interface FakeGain {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeContext {
  state: string;
  currentTime: number;
  destination: object;
  oscillators: FakeOscillator[];
  gains: FakeGain[];
  resume: ReturnType<typeof vi.fn>;
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
}

function fakeContext(
  initialState: 'running' | 'suspended' = 'running',
  resumeImpl?: (ctx: FakeContext) => Promise<void>,
): FakeContext {
  const ctx: FakeContext = {
    state: initialState,
    currentTime: 0,
    destination: {},
    oscillators: [],
    gains: [],
    resume: vi.fn(() => {
      if (resumeImpl) return resumeImpl(ctx);
      ctx.state = 'running';
      return Promise.resolve();
    }),
    createOscillator: vi.fn(() => {
      const osc: FakeOscillator = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      ctx.oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => {
      const gain: FakeGain = {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      ctx.gains.push(gain);
      return gain;
    }),
  };
  return ctx;
}

function build(factory: () => unknown) {
  TestBed.configureTestingModule({
    providers: [{ provide: NOTIFICATION_SOUND_AUDIO_CONTEXT_FACTORY, useValue: factory }],
  });
  return TestBed.inject(NotificationSoundService);
}

/** Lets already-settled promise callbacks (the resume() continuation) run. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});

describe('NotificationSoundService', () => {
  describe('enabled setting', () => {
    it('defaults to on when nothing is stored', () => {
      const service = build(() => fakeContext());
      expect(service.enabled()).toBe(true);
    });

    it('setEnabled persists "0"/"1" and toggle returns the new value', () => {
      const service = build(() => fakeContext());

      service.setEnabled(false);
      expect(service.enabled()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('0');

      expect(service.toggle()).toBe(true);
      expect(service.enabled()).toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('1');

      expect(service.toggle()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('0');
    });

    it('restores the stored choice when constructed', () => {
      localStorage.setItem(STORAGE_KEY, '0');
      expect(build(() => fakeContext()).enabled()).toBe(false);

      TestBed.resetTestingModule();
      localStorage.setItem(STORAGE_KEY, '1');
      expect(build(() => fakeContext()).enabled()).toBe(true);
    });

    it('treats an unreadable stored value as the default (on)', () => {
      localStorage.setItem(STORAGE_KEY, 'garbage');
      expect(build(() => fakeContext()).enabled()).toBe(true);
    });

    it('survives a localStorage that throws on read — falls back to on', () => {
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const service = build(() => fakeContext());
      expect(service.enabled()).toBe(true);
    });

    it('survives a localStorage that throws on write — the in-memory choice still applies', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const service = build(() => fakeContext());

      expect(() => service.setEnabled(false)).not.toThrow();
      expect(service.enabled()).toBe(false);
    });
  });

  describe('play()', () => {
    it('plays a two-note chime on a running context with an attack/decay envelope', () => {
      const ctx = fakeContext();
      const service = build(() => ctx);

      service.play();

      expect(ctx.oscillators).toHaveLength(2);
      expect(ctx.gains).toHaveLength(2);
      const [first, second] = ctx.oscillators;
      expect(first.frequency.value).toBeLessThan(second.frequency.value); // ascending
      for (const osc of ctx.oscillators) {
        expect(osc.start).toHaveBeenCalledTimes(1);
        expect(osc.stop).toHaveBeenCalledTimes(1);
        expect(osc.connect).toHaveBeenCalledTimes(1);
      }
      for (const gain of ctx.gains) {
        // Starts silent, ramps up (no click), then decays — peak stays moderate, never harsh.
        expect(gain.gain.setValueAtTime.mock.calls[0][0]).toBe(0);
        const peak = gain.gain.linearRampToValueAtTime.mock.calls[0][0] as number;
        expect(peak).toBeGreaterThan(0);
        expect(peak).toBeLessThanOrEqual(0.25);
        expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledTimes(1);
      }
      // Whole chime is short (~0.4s): the last note must stop well under a second out.
      const lastStop = ctx.oscillators[1].stop.mock.calls[0][0] as number;
      expect(lastStop).toBeLessThan(0.6);
    });

    it('releases its audio nodes once an oscillator ends', () => {
      const ctx = fakeContext();
      build(() => ctx).play();

      ctx.oscillators[0].onended?.();

      expect(ctx.oscillators[0].disconnect).toHaveBeenCalledTimes(1);
      expect(ctx.gains[0].disconnect).toHaveBeenCalledTimes(1);
    });

    it('is a no-op while sound is off — no context is even created', () => {
      const factory = vi.fn(() => fakeContext());
      const service = build(factory);
      service.setEnabled(false);

      service.play();

      expect(factory).not.toHaveBeenCalled();
    });

    it('does not create oscillators for a muted reader', () => {
      const ctx = fakeContext();
      const service = build(() => ctx);
      service.setEnabled(false);

      service.play();
      service.preview();

      expect(ctx.createOscillator).not.toHaveBeenCalled();
    });

    it('plays again after being turned back on', () => {
      const ctx = fakeContext();
      const service = build(() => ctx);
      service.setEnabled(false);
      service.play();
      service.setEnabled(true);

      service.play();

      expect(ctx.oscillators).toHaveLength(2);
    });

    it('throttles: calls inside the window ring once, a call after it rings again', () => {
      const ctx = fakeContext();
      const service = build(() => ctx);

      service.play();
      vi.advanceTimersByTime(NOTIFICATION_SOUND_THROTTLE_MS - 500);
      service.play();
      service.play();
      expect(ctx.oscillators).toHaveLength(2); // one chime = two notes

      vi.advanceTimersByTime(600); // now past the window
      service.play();
      expect(ctx.oscillators).toHaveLength(4);
    });

    it('the throttle window is at least 1.5 seconds', () => {
      expect(NOTIFICATION_SOUND_THROTTLE_MS).toBeGreaterThanOrEqual(1500);
    });
  });

  describe('preview()', () => {
    it('plays immediately even inside the throttle window (a deliberate click, not a burst)', () => {
      const ctx = fakeContext();
      const service = build(() => ctx);

      service.play();
      service.preview();

      expect(ctx.oscillators).toHaveLength(4);
    });
  });

  describe('failure handling — never throws, never rings when it cannot', () => {
    it('is a no-op when the platform has no AudioContext (factory returns null)', () => {
      const factory = vi.fn(() => null);
      const service = build(factory);

      expect(() => service.play()).not.toThrow();
      vi.advanceTimersByTime(NOTIFICATION_SOUND_THROTTLE_MS + 1);
      expect(() => service.play()).not.toThrow();
      expect(() => service.preview()).not.toThrow();

      expect(factory).toHaveBeenCalledTimes(1); // "unsupported" is remembered
    });

    it('does not throw when constructing the context throws', () => {
      const service = build(() => {
        throw new Error('too many AudioContexts');
      });

      expect(() => service.play()).not.toThrow();
    });

    it('does not throw when building the chime throws', () => {
      const ctx = fakeContext();
      ctx.createOscillator.mockImplementation(() => {
        throw new Error('InvalidStateError');
      });
      const service = build(() => ctx);

      expect(() => service.play()).not.toThrow();
    });

    it('stays silent when the context is suspended and resume() is rejected', async () => {
      const ctx = fakeContext('suspended', () => Promise.reject(new Error('NotAllowedError')));
      const service = build(() => ctx);

      expect(() => service.play()).not.toThrow();
      await flush();

      expect(ctx.resume).toHaveBeenCalledTimes(1);
      expect(ctx.createOscillator).not.toHaveBeenCalled();
    });

    it('stays silent when resume() resolves but the context never reaches running', async () => {
      const ctx = fakeContext('suspended', () => Promise.resolve());
      const service = build(() => ctx);

      service.play();
      await flush();

      expect(ctx.createOscillator).not.toHaveBeenCalled();
    });

    it('rings once a suspended context resumes promptly', async () => {
      const ctx = fakeContext('suspended');
      const service = build(() => ctx);

      service.play();
      await flush();

      expect(ctx.resume).toHaveBeenCalledTimes(1);
      expect(ctx.oscillators).toHaveLength(2);
    });

    it('drops a stale chime: a resume that only completes seconds later stays silent', async () => {
      let release: () => void = () => {};
      const ctx = fakeContext('suspended', (c) => new Promise<void>((resolve) => {
        release = () => {
          c.state = 'running';
          resolve();
        };
      }));
      const service = build(() => ctx);

      service.play();
      vi.advanceTimersByTime(10_000); // the reader finally clicks, long after the arrival
      release();
      await flush();

      expect(ctx.createOscillator).not.toHaveBeenCalled();
    });

    it('does not throw if resume() itself throws synchronously', () => {
      const ctx = fakeContext('suspended', () => {
        throw new Error('boom');
      });
      const service = build(() => ctx);

      expect(() => service.play()).not.toThrow();
    });
  });

  describe('first-interaction unlock', () => {
    it('primes (creates + resumes) the context on the first pointerdown, then stops listening', async () => {
      const ctx = fakeContext('suspended');
      const factory = vi.fn(() => ctx);
      build(factory);

      document.dispatchEvent(new Event('pointerdown'));
      await flush();
      expect(factory).toHaveBeenCalledTimes(1);
      expect(ctx.resume).toHaveBeenCalledTimes(1);
      expect(ctx.state).toBe('running');

      document.dispatchEvent(new Event('keydown'));
      document.dispatchEvent(new Event('pointerdown'));
      await flush();
      expect(ctx.resume).toHaveBeenCalledTimes(1); // listeners were removed
    });

    it('keeps listening while the context is still not running (e.g. iOS touchstart)', async () => {
      const ctx = fakeContext('suspended', () => Promise.resolve());
      build(() => ctx);

      document.dispatchEvent(new Event('touchstart'));
      await flush();
      document.dispatchEvent(new Event('touchend'));
      await flush();

      expect(ctx.resume).toHaveBeenCalledTimes(2);
    });

    it('creates no context for a reader who muted the sound, and keeps listening', async () => {
      localStorage.setItem(STORAGE_KEY, '0');
      const factory = vi.fn(() => fakeContext('suspended'));
      build(factory);

      document.dispatchEvent(new Event('pointerdown'));
      await flush();

      expect(factory).not.toHaveBeenCalled();
    });

    it('stops listening when the platform has no AudioContext', async () => {
      const factory = vi.fn(() => null);
      build(factory);

      document.dispatchEvent(new Event('pointerdown'));
      document.dispatchEvent(new Event('pointerdown'));

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('swallows an unlock failure (resume rejected)', async () => {
      const ctx = fakeContext('suspended', () => Promise.reject(new Error('NotAllowedError')));
      build(() => ctx);

      expect(() => document.dispatchEvent(new Event('pointerdown'))).not.toThrow();
      await flush();
    });

    it('removes its document listeners when the service is destroyed', async () => {
      const ctx = fakeContext('suspended');
      build(() => ctx);
      TestBed.resetTestingModule();

      document.dispatchEvent(new Event('pointerdown'));
      await flush();

      expect(ctx.resume).not.toHaveBeenCalled();
    });

    it('lets a notification chime ring when the unlock gesture lands right after the arrival', async () => {
      const ctx = fakeContext('suspended', (c) => new Promise<void>((resolve) => {
        setTimeout(() => {
          c.state = 'running';
          resolve();
        }, 500);
      }));
      const service = build(() => ctx);

      service.play(); // arrival while the context is still locked → resume pending
      vi.advanceTimersByTime(500); // the reader's click lets it through within the freshness window
      await flush();

      expect(ctx.oscillators).toHaveLength(2);
    });
  });
});
