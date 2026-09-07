import { Pipe, PipeTransform } from '@angular/core';

/**
 * Extracts the last path segment from a storage key / URL so admin UIs display just the file name
 * instead of the full storage path (e.g. `sellers/abc/documents/xyz/final.pdf` → `final.pdf`).
 * Values without a `/` (already a bare file name) pass through unchanged.
 */
@Pipe({ name: 'fileName', standalone: true })
export class FileNamePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const segments = value.split('/');
    return segments.pop() || value;
  }
}
