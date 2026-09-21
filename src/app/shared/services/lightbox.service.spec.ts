import { TestBed } from '@angular/core/testing';
import { LightboxService } from './lightbox.service';

describe('LightboxService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts with no item open', () => {
    const service = TestBed.inject(LightboxService);
    expect(service.current()).toBeNull();
  });

  it('open() sets the current item', () => {
    const service = TestBed.inject(LightboxService);
    service.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    expect(service.current()).toEqual({ src: 'https://cdn.test/full.webp', alt: 'ปกเอกสาร' });
  });

  it('close() clears the current item', () => {
    const service = TestBed.inject(LightboxService);
    service.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    service.close();
    expect(service.current()).toBeNull();
  });

  it('a later open() replaces the previous item', () => {
    const service = TestBed.inject(LightboxService);
    service.open('https://cdn.test/a.webp', 'a');
    service.open('https://cdn.test/b.webp', 'b');
    expect(service.current()).toEqual({ src: 'https://cdn.test/b.webp', alt: 'b' });
  });
});
