import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerService } from '../../../core/services';
import { WatermarkEditorPage } from './watermark-editor.page';

describe('WatermarkEditorPage', () => {
  let component: WatermarkEditorPage;
  let fixture: ComponentFixture<WatermarkEditorPage>;

  const fakeSellerService = {
    listDocumentsPaged: vi.fn().mockResolvedValue({
      items: [
        {
          id: 'doc-123',
          title: 'คู่มือเตรียมสอบฟิสิกส์ ม.6',
          price: 150,
          format: 'pdf',
        },
      ],
      totalCount: 1,
    }),
  };

  const fakeMessageService = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatermarkEditorPage],
      providers: [
        provideRouter([]),
        { provide: SellerService, useValue: fakeSellerService },
        { provide: NzMessageService, useValue: fakeMessageService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatermarkEditorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component with default tab and settings', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('web-preview');
    expect(component.previewMode()).toBe('simulator');
    expect(component.watermarkPosition()).toBe('center-diagonal');
    expect(component.watermarkOpacity()).toBe(25);
    expect(component.watermarkColor()).toBe('#E11D48');
  });

  it('should switch tabs correctly', () => {
    component.activeTab.set('personalized');
    expect(component.activeTab()).toBe('personalized');

    component.activeTab.set('web-preview');
    expect(component.activeTab()).toBe('web-preview');
  });

  it('should adjust rotation when changing to center-diagonal or tile', () => {
    component.setPosition('top-left');
    expect(component.watermarkPosition()).toBe('top-left');
    expect(component.watermarkRotation()).toBe(0);

    component.setPosition('center-diagonal');
    expect(component.watermarkPosition()).toBe('center-diagonal');
    expect(component.watermarkRotation()).toBe(-30);

    component.setPosition('tile');
    expect(component.watermarkPosition()).toBe('tile');
    expect(component.watermarkRotation()).toBe(-25);
  });

  it('should insert variable tags into download template', () => {
    component.downloadWatermarkTemplate.set('เอกสารนี้ของ {email}');
    component.insertTag('{token}');
    expect(component.downloadWatermarkTemplate()).toBe('เอกสารนี้ของ {email} {token}');
  });

  it('should compute personalized download text replacing {email}, {token}, {date}, and {platform}', () => {
    component.simBuyerEmail.set('test.buyer@edu.ac.th');
    component.simToken.set('SEC-TEST-999');
    component.downloadWatermarkTemplate.set(
      'ผู้ซื้อ: {email} | รหัส: {token} | แพลตฟอร์ม: {platform}'
    );

    const result = component.simulatedDownloadText();
    expect(result).toContain('ผู้ซื้อ: test.buyer@edu.ac.th');
    expect(result).toContain('รหัส: SEC-TEST-999');
    expect(result).toContain('แพลตฟอร์ม: SIRI EDUMARKET');
  });
});
