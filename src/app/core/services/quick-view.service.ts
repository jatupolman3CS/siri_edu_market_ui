import { Injectable, signal } from '@angular/core';
import { DocumentItem } from '../models';

@Injectable({ providedIn: 'root' })
export class QuickViewService {
  private readonly _doc = signal<DocumentItem | null>(null);
  readonly doc = this._doc.asReadonly();

  open(doc: DocumentItem): void {
    this._doc.set(doc);
  }

  close(): void {
    this._doc.set(null);
  }
}
