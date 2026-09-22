import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppShell } from './app-shell';

describe('AppShell', () => {
  let component: AppShell;
  let fixture: ComponentFixture<AppShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShell);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('returns focus to the header toggle after closing the sidebar', async () => {
    fixture.detectChanges();

    const toggle: HTMLButtonElement | null = fixture.nativeElement.querySelector('header button');
    if (!toggle) throw new Error('No se renderizó el botón de menú');

    toggle.focus();
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const closeButton: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('.btn--close');
    if (!closeButton) throw new Error('No se renderizó el botón de cerrar el sidebar');

    closeButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(toggle);
  });

  it('closes the sidebar drawer when the backdrop is clicked', async () => {
    fixture.detectChanges();

    const toggle: HTMLButtonElement | null = fixture.nativeElement.querySelector('header button');
    toggle?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.sidebar-backdrop')).toBeTruthy();

    const backdrop: HTMLElement | null = fixture.nativeElement.querySelector('.sidebar-backdrop');
    backdrop?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.sidebarOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.sidebar-backdrop')).toBeNull();
  });
});
