import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Header } from './header';

describe('Header', () => {
  let component: Header;
  let fixture: ComponentFixture<Header>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Header],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function toggleButton(): HTMLButtonElement {
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    if (!button) {
      throw new Error('No se renderizó el botón de menú');
    }
    return button;
  }

  it('exposes aria-expanded reflecting the sidebarOpen input', () => {
    fixture.detectChanges();
    expect(toggleButton().getAttribute('aria-expanded')).toBe('false');

    fixture.componentRef.setInput('sidebarOpen', true);
    fixture.detectChanges();
    expect(toggleButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('emits viewSidebar when the toggle is clicked', () => {
    expect.assertions(1);
    fixture.detectChanges();
    component.viewSidebar.subscribe(() => expect(true).toBe(true));
    toggleButton().click();
  });
});
