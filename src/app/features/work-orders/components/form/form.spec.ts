import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Form } from './form';

describe('Form', () => {
  let component: Form;
  let fixture: ComponentFixture<Form>;

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  function fillValidValues(): void {
    component.workOrderForm.setValue({
      title: 'Revisar motor',
      description: 'Revisar temperatura del motor',
      asset: 'Motor 1',
      priority: 'medium',
    });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Form],
    }).compileComponents();

    fixture = TestBed.createComponent(Form);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('blocks emission when required fields are empty, with the submit button enabled', () => {
    expect.assertions(2);
    const emit = vi.spyOn(component.sendData, 'emit');

    component.onSubmit();

    expect(emit).not.toHaveBeenCalled();
    // Habilitado a propósito (spec 008b): si estuviera deshabilitado,
    // markAllAsTouched() sería inalcanzable y un usuario de teclado
    // llegaría al final del form sin ninguna explicación.
    expect(submitButton().disabled).toBe(false);
  });

  it('reveals validation error messages after an attempted submit on an untouched form', () => {
    component.onSubmit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'El título es obligatorio y debe tener al menos 3 caracteres.',
    );
  });

  it('exposes aria-invalid and aria-describedby pointing to the error on an invalid control', () => {
    expect.assertions(3);
    component.onSubmit();
    fixture.detectChanges();

    const titleInput: HTMLInputElement | null = fixture.nativeElement.querySelector('#title');
    if (!titleInput) throw new Error('No se renderizó el input de título');

    expect(titleInput.getAttribute('aria-invalid')).toBe('true');
    expect(titleInput.getAttribute('aria-describedby')).toBe('title-error');
    expect(fixture.nativeElement.querySelector('#title-error')).toBeTruthy();
  });

  it('does not expose aria-invalid on a valid control', () => {
    fillValidValues();
    Object.values(component.workOrderForm.controls).forEach((control) => control.markAsTouched());
    fixture.detectChanges();

    const titleInput: HTMLInputElement | null = fixture.nativeElement.querySelector('#title');
    if (!titleInput) throw new Error('No se renderizó el input de título');

    expect(titleInput.getAttribute('aria-invalid')).toBe('false');
  });

  it('emits the raw form value when the form is valid and not submitting', () => {
    expect.assertions(1);
    const emit = vi.spyOn(component.sendData, 'emit');
    fillValidValues();

    component.onSubmit();

    expect(emit).toHaveBeenCalledExactlyOnceWith({
      title: 'Revisar motor',
      description: 'Revisar temperatura del motor',
      asset: 'Motor 1',
      priority: 'medium',
    });
  });

  it('disables the submit button and blocks emission while submitting() is true, even with a valid form', () => {
    expect.assertions(2);
    fillValidValues();
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    const emit = vi.spyOn(component.sendData, 'emit');

    expect(submitButton().disabled).toBe(true);

    component.onSubmit();
    expect(emit).not.toHaveBeenCalled();
  });

  it('re-enables the button once submitting() goes back to false', () => {
    fillValidValues();
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();

    fixture.componentRef.setInput('submitting', false);
    fixture.detectChanges();

    expect(submitButton().disabled).toBe(false);
  });
});
