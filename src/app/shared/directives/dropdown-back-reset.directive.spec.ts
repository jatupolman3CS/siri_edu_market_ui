import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NzDropDownModule, NzDropdownDirective } from 'ng-zorro-antd/dropdown';
import { DropdownBackResetDirective } from './dropdown-back-reset.directive';

@Component({
  standalone: true,
  imports: [NzDropDownModule, DropdownBackResetDirective],
  template: `
    <button type="button" nz-dropdown nzTrigger="click" [nzDropdownMenu]="menu">open</button>
    <nz-dropdown-menu #menu="nzDropdownMenu">
      <ul nz-menu><li nz-menu-item>item</li></ul>
    </nz-dropdown-menu>
  `,
})
class HostComponent {}

type OverlayField = { overlayRef: { hostElement: HTMLElement | null } | null };

function setup() {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [provideLocationMocks(), provideNoopAnimations()],
  });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const trigger = fixture.debugElement.query(By.css('button'));
  const dropdown = trigger.injector.get(NzDropdownDirective) as unknown as OverlayField;
  const location = TestBed.inject(Location) as SpyLocation;
  return { dropdown, location, directive: trigger.injector.get(DropdownBackResetDirective) };
}

const flushMicrotasks = () => new Promise<void>((r) => queueMicrotask(r));

afterEach(() => TestBed.resetTestingModule());

describe('DropdownBackResetDirective', () => {
  it('attaches to every nz-dropdown trigger of the importing component', () => {
    const { directive } = setup();
    expect(directive).toBeTruthy();
  });

  it('drops an overlay that CDK disposed on popstate, so the next tap builds a fresh one', async () => {
    const { dropdown, location } = setup();
    // A disposed OverlayRef has no host element any more.
    dropdown.overlayRef = { hostElement: null };
    location.simulateUrlPop('/elsewhere');
    await flushMicrotasks();
    expect(dropdown.overlayRef).toBeNull();
  });

  it('leaves a live overlay alone', async () => {
    const { dropdown, location } = setup();
    const live = { hostElement: document.createElement('div'), dispose: () => {} };
    dropdown.overlayRef = live;
    location.simulateUrlPop('/elsewhere');
    await flushMicrotasks();
    expect(dropdown.overlayRef).toBe(live);
    dropdown.overlayRef = null;
  });

  it('stops listening once the trigger is destroyed', async () => {
    const { dropdown, location } = setup();
    TestBed.resetTestingModule();
    dropdown.overlayRef = { hostElement: null };
    location.simulateUrlPop('/elsewhere');
    await flushMicrotasks();
    expect(dropdown.overlayRef).not.toBeNull();
  });
});
