import { revealFocusedChip } from './chip-row-focus';

/**
 * responsive-ui v1.4 R-12 (G-22a): a chip that takes keyboard focus inside a `.chip-row` is
 * scrolled into the row (nearest edge, both axes) so neither the chip nor its inside focus ring is
 * cut off by the scroller.
 */
describe('revealFocusedChip (G-22a)', () => {
  let host: HTMLDivElement;
  let row: HTMLDivElement;

  function addChip(parent: Element, label: string): HTMLButtonElement {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = label;
    parent.appendChild(chip);
    return chip;
  }

  function focusin(target: EventTarget): void {
    target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  }

  /** jsdom has no `scrollIntoView`; install a spy on the element instead. */
  function spyScroll(el: HTMLElement) {
    const spy = vi.fn();
    Object.defineProperty(el, 'scrollIntoView', { value: spy, configurable: true });
    return spy;
  }

  function keyboardFocus(el: HTMLElement, visible: boolean): void {
    const original = el.matches.bind(el);
    vi.spyOn(el, 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible' ? visible : original(selector),
    );
  }

  beforeEach(() => {
    host = document.createElement('div');
    row = document.createElement('div');
    row.className = 'chip-row';
    host.appendChild(row);
    document.body.appendChild(host);
    host.addEventListener('focusin', revealFocusedChip);
  });

  afterEach(() => {
    host.removeEventListener('focusin', revealFocusedChip);
    host.remove();
    vi.restoreAllMocks();
  });

  it('scrolls a keyboard-focused chip to the nearest edge of its row', () => {
    const chip = addChip(row, 'รอตรวจสอบ');
    const scroll = spyScroll(chip);
    keyboardFocus(chip, true);

    focusin(chip);

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('also reveals a focusable nested inside a chip wrapper', () => {
    const wrapper = document.createElement('span');
    row.appendChild(wrapper);
    const link = document.createElement('a');
    link.href = '/categories';
    wrapper.appendChild(link);
    const scroll = spyScroll(link);
    keyboardFocus(link, true);

    focusin(link);

    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('leaves pointer focus alone, so a press never moves the chip out from under the pointer', () => {
    const chip = addChip(row, 'ไม่ผ่าน');
    const scroll = spyScroll(chip);
    keyboardFocus(chip, false);

    focusin(chip);

    expect(scroll).not.toHaveBeenCalled();
  });

  it('ignores focus outside a .chip-row', () => {
    const outside = addChip(host, 'ค้นหา');
    const scroll = spyScroll(outside);
    keyboardFocus(outside, true);

    focusin(outside);

    expect(scroll).not.toHaveBeenCalled();
  });

  it('falls back to revealing when the engine does not support :focus-visible', () => {
    const chip = addChip(row, 'คณิต ม.ปลาย');
    const scroll = spyScroll(chip);
    vi.spyOn(chip, 'matches').mockImplementation(() => {
      throw new SyntaxError('unsupported selector');
    });

    focusin(chip);

    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('does nothing for non-element targets', () => {
    expect(() => revealFocusedChip(new FocusEvent('focusin'))).not.toThrow();
  });
});
