import { Pipe, PipeTransform } from '@angular/core';

/**
 * A LINE account that signs in without sharing an email gets a synthetic `line_<subject>@…invalid`
 * address on the backend (USER.Email is required). That address is an internal id, not something
 * to show — render a readable label instead.
 */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && /\.invalid$/i.test(email.trim());
}

@Pipe({ name: 'displayEmail', standalone: true })
export class DisplayEmailPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return isPlaceholderEmail(value) ? 'LINE' : value;
  }
}
