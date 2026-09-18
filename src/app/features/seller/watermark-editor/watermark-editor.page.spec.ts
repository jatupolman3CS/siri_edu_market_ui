import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { SellerWatermarkTemplateService } from '../../../core/services/seller-watermark-template.service';
import { WatermarkEditorPage } from './watermark-editor.page';

describe('WatermarkEditorPage', () => {
  let component: WatermarkEditorPage;
  let fixture: ComponentFixture<WatermarkEditorPage>;

  const fakeAuthService = {
    user: vi.fn().mockReturnValue({ id: 'seller-test-1', email: 'seller@test.com' }),
  };

  const fakeMessageService = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };

  type TemplateData = {
    enabled: boolean;
    previewWatermarkSubtitle: string;
    previewWatermarkFontFamily: string;
    config: {
      watermarkText: string;
      watermarkPosition: string;
      watermarkOpacity: number;
      watermarkColor: string;
      watermarkFontSize: number;
      watermarkRotationDegrees: number;
      downloadWatermarkPosition: string;
      downloadWatermarkTemplate: string;
    };
  };

  let storedTemplate: TemplateData | null = null;
  const mockTemplateService = {
    loadOrDefault: vi.fn((): TemplateData => {
      return (
        storedTemplate ?? {
          enabled: true,
          previewWatermarkSubtitle: '',
          previewWatermarkFontFamily: 'Noto Sans Thai',
          config: {
            watermarkText: 'SIRI EDUMARKET PREVIEW',
            watermarkPosition: 'center-diagonal',
            watermarkOpacity: 0.25,
            watermarkColor: '#E11D48',
            watermarkFontSize: 42,
            watermarkRotationDegrees: -30,
            downloadWatermarkPosition: 'footer',
            downloadWatermarkTemplate: '',
          },
        }
      );
    }),
    save: vi.fn((_id: string | null | undefined, tpl: TemplateData) => {
      storedTemplate = tpl;
      return true;
    }),
    load: vi.fn((_id?: string | null): TemplateData | null => storedTemplate),
  };

  beforeEach(async () => {
    storedTemplate = null;

    await TestBed.configureTestingModule({
      imports: [WatermarkEditorPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuthService },
        { provide: NzMessageService, useValue: fakeMessageService },
        { provide: SellerWatermarkTemplateService, useValue: mockTemplateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatermarkEditorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create component with default tab and settings', () => {
    expect(component).toBeTruthy();
    expect(component.activeTab()).toBe('web-preview');
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

  it('should save template configuration using SellerWatermarkTemplateService', () => {
    component.watermarkText.set('CUSTOM SELLER WATERMARK');
    component.watermarkPosition.set('bottom-right');
    component.saveConfig();

    expect(mockTemplateService.save).toHaveBeenCalled();
    const saved = storedTemplate;
    expect(saved).not.toBeNull();
    expect(saved?.config.watermarkText).toBe('CUSTOM SELLER WATERMARK');
    expect(saved?.config.watermarkPosition).toBe('bottom-right');
  });
});
