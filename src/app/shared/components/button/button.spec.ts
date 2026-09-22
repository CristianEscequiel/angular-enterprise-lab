import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Button } from './button';

describe('Button', () => {
  let component: Button;
  let fixture: ComponentFixture<Button>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Button],
    }).compileComponents();

    fixture = TestBed.createComponent(Button);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  function nativeButton(): HTMLButtonElement {
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    if (!button) {
      throw new Error('No se renderizó el botón nativo');
    }
    return button;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('no emite aria-label cuando no se le pasa uno', () => {
    fixture.detectChanges();
    expect(nativeButton().hasAttribute('aria-label')).toBe(false);
  });

  it('expone el aria-label recibido en el botón nativo', () => {
    fixture.componentRef.setInput('ariaLabel', 'Eliminar Revisar motor');
    fixture.detectChanges();
    expect(nativeButton().getAttribute('aria-label')).toBe('Eliminar Revisar motor');
  });

  it('refleja el type en el botón nativo, con button por defecto', () => {
    fixture.detectChanges();
    expect(nativeButton().type).toBe('button');

    fixture.componentRef.setInput('type', 'submit');
    fixture.detectChanges();
    expect(nativeButton().type).toBe('submit');
  });
});
