import { computed, signal } from '@angular/core';

const _count = signal(0);
export const inFlightCount = _count.asReadonly();
export const isLoading = computed(() => _count() > 0);

export function startLoading(): void {
  _count.update((c) => c + 1);
}

export function finishLoading(): void {
  _count.update((c) => Math.max(0, c - 1));
}

