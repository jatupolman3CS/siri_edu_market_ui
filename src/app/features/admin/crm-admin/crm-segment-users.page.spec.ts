import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrmSegmentUsersPage } from './crm-segment-users.page';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { CrmSegmentUser } from '../../../core/models';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

/**
 * crm-core v1 §3.5/§4.4 — "สมาชิกของกลุ่ม {code}", and responsive-ui v1.6 R-27 (§4.5 v1.6 inventory
 * row 17): the members table sits in a table viewport named by the page heading. A new segment,
 * page or page size scrolls it back to its top; the pagination stays outside the wrapper.
 */

function member(i: number): CrmSegmentUser {
  return {
    userId: `user-${i}`,
    displayName: `สมาชิก ${i}`,
    email: `member-${i}@example.com`,
    interestConfidence: 0.5,
    topCategoryLabel: 'คณิตศาสตร์',
    lastActivityAt: '2026-09-20T00:00:00Z',
    assignedAt: '2026-09-01T00:00:00Z',
  };
}

function buildCrmFake(users: CrmSegmentUser[]) {
  // Writable like the real ServerPager's, so a page / page-size change reaches the template.
  const segmentUsersPage = signal(1);
  const segmentUsersPageSize = signal(10);
  return {
    segmentUsers: () => users,
    segmentUsersPage,
    segmentUsersPageSize,
    segmentUsersTotalCount: () => 250,
    segmentUsersTotalPages: () => 25,
    segmentUsersLoading: () => false,
    loadSegmentUsers: vi.fn(async () => {}),
    onSegmentUsersPageChange: vi.fn(async (page: number) => segmentUsersPage.set(page)),
    onSegmentUsersPageSizeChange: vi.fn(async (size: number) => {
      segmentUsersPageSize.set(size);
      segmentUsersPage.set(1);
    }),
  };
}

async function render(users: CrmSegmentUser[], code = 'dormant') {
  const crmFake = buildCrmFake(users);
  TestBed.configureTestingModule({
    imports: [CrmSegmentUsersPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ code }) } } },
      { provide: CrmService, useValue: crmFake },
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(CrmSegmentUsersPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const wrapper = (root.querySelector('table') as HTMLTableElement).parentElement as HTMLElement;
  const directive = fixture.debugElement.query(By.directive(TableViewportDirective)).injector.get(TableViewportDirective);
  return { fixture, crmFake, root, wrapper, directive };
}

afterEach(() => TestBed.resetTestingModule());

describe('CrmSegmentUsersPage', () => {
  it('loads the segment named in the route once on init and renders its members', async () => {
    const { crmFake, root } = await render([member(1), member(2)], 'loyal_buyer');
    expect(crmFake.loadSegmentUsers).toHaveBeenCalledTimes(1);
    expect(crmFake.loadSegmentUsers).toHaveBeenCalledWith('loyal_buyer');
    expect(root.querySelectorAll('tbody tr').length).toBe(2);
  });
});

describe('CrmSegmentUsersPage — table viewport (responsive-ui v1.6 R-27)', () => {
  it('puts the table in an rt-viewport wrapper named by the page heading, with the pagination after it', async () => {
    const users = Array.from({ length: 25 }, (_, i) => member(i + 1));
    const { root, wrapper, directive } = await render(users);
    expect(wrapper.classList.contains('rt-viewport')).toBe(true);

    const heading = root.querySelector<HTMLElement>(`#${directive.rtLabelledBy()}`);
    expect(heading?.tagName).toBe('H1');
    expect(heading?.textContent).toContain('dormant');

    const pagination = root.querySelector('app-pagination') as HTMLElement;
    expect(pagination).not.toBeNull();
    expect(wrapper.contains(pagination)).toBe(false);
    expect(wrapper.compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('builds the reset key from the segment code, the page and the page size', async () => {
    const { directive } = await render([member(1)], 'exam_prep');
    expect(directive.rtResetKey()).toBe('exam_prep|1|10');
  });

  it('a new page or page size scrolls the table back to its top', async () => {
    const users = Array.from({ length: 25 }, (_, i) => member(i + 1));
    const { fixture, wrapper } = await render(users);

    wrapper.scrollTop = 300;
    expect(wrapper.scrollTop).toBe(300);
    await fixture.componentInstance.onPageChange(2);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(wrapper.scrollTop).toBe(0);

    wrapper.scrollTop = 300;
    await fixture.componentInstance.onPageSizeChange(50);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(wrapper.scrollTop).toBe(0);
  });

  it('a re-render without a query change keeps the scroll position', async () => {
    const users = Array.from({ length: 25 }, (_, i) => member(i + 1));
    const { fixture, wrapper } = await render(users);

    wrapper.scrollTop = 300;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(wrapper.scrollTop).toBe(300);
  });
});
