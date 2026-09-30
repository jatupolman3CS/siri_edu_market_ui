import { TestBed } from '@angular/core/testing';
import { ModalA11yService } from './modal-a11y.service';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

function modalWrap(title: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ant-modal-wrap';
  wrap.setAttribute('role', 'dialog');
  wrap.innerHTML =
    '<div class="ant-modal"><div class="ant-modal-content"><div class="ant-modal-header">' +
    `<div class="ant-modal-title">${title}</div></div><div class="ant-modal-body"></div></div></div>`;
  return wrap;
}

describe('ModalA11yService', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => node.remove());
  });

  it('gives every nz-modal wrap aria-modal and an accessible name from its title', async () => {
    const container = document.createElement('div');
    container.className = 'cdk-overlay-container';
    document.body.appendChild(container);
    TestBed.inject(ModalA11yService);

    const wrap = modalWrap('รายงานปัญหาเอกสาร');
    container.appendChild(wrap);
    await flush();

    expect(wrap.getAttribute('aria-modal')).toBe('true');
    const id = wrap.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id as string)?.textContent).toBe('รายงานปัญหาเอกสาร');
  });

  it('picks up the overlay container once CDK creates it', async () => {
    TestBed.inject(ModalA11yService);
    const container = document.createElement('div');
    container.className = 'cdk-overlay-container';
    const wrap = modalWrap('ยืนยัน');
    container.appendChild(wrap);
    document.body.appendChild(container);
    await flush();

    expect(wrap.getAttribute('aria-modal')).toBe('true');
    expect(wrap.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('leaves a dialog without a title unnamed rather than pointing at nothing', () => {
    const service = TestBed.inject(ModalA11yService);
    const root = document.createElement('div');
    const wrap = modalWrap('');
    root.appendChild(wrap);

    service.decorate(root);

    expect(wrap.getAttribute('aria-modal')).toBe('true');
    expect(wrap.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('keeps an existing title id', () => {
    const service = TestBed.inject(ModalA11yService);
    const root = document.createElement('div');
    const wrap = modalWrap('ชื่อ');
    (wrap.querySelector('.ant-modal-title') as HTMLElement).id = 'my-title';
    root.appendChild(wrap);

    service.decorate(root);

    expect(wrap.getAttribute('aria-labelledby')).toBe('my-title');
  });
});
