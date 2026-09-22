import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Alert } from './alert';

describe('Alert', () => {
  let component: Alert;
  let fixture: ComponentFixture<Alert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Alert],
    }).compileComponents();

    fixture = TestBed.createComponent(Alert);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('title', 'Operación exitosa');
    fixture.componentRef.setInput('message', 'Los datos fueron guardados correctamente');
    fixture.componentRef.setInput('variant', 'success');

    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses role="status" and aria-live="polite" for non-error variants', () => {
    expect.assertions(2);
    const alertDiv: HTMLElement | null = fixture.nativeElement.querySelector('.alert');
    if (!alertDiv) throw new Error('No se renderizó el alert');

    expect(alertDiv.getAttribute('role')).toBe('status');
    expect(alertDiv.getAttribute('aria-live')).toBe('polite');
  });

  it('uses role="alert" and aria-live="assertive" only for the error variant', () => {
    expect.assertions(2);
    fixture.componentRef.setInput('variant', 'error');
    fixture.detectChanges();

    const alertDiv: HTMLElement | null = fixture.nativeElement.querySelector('.alert');
    if (!alertDiv) throw new Error('No se renderizó el alert');

    expect(alertDiv.getAttribute('role')).toBe('alert');
    expect(alertDiv.getAttribute('aria-live')).toBe('assertive');
  });
});
