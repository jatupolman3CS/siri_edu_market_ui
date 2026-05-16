export type ActionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; message?: string }
  | { status: 'error'; message: string };

export function idleActionState(): ActionState {
  return { status: 'idle' };
}

export function loadingActionState(): ActionState {
  return { status: 'loading' };
}

export function successActionState(message?: string): ActionState {
  return { status: 'success', message };
}

export function errorActionState(message: string): ActionState {
  return { status: 'error', message };
}

