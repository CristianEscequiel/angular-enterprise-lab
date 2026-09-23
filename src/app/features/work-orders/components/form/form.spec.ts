import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkOrderCreateRequest, WorkOrderType } from '../../models/work-order.model';
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
      type: 'correctivo',
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
      type: 'correctivo',
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

  describe('order type', () => {
    interface Inputs {
      allowedTypes?: readonly WorkOrderType[];
      lockType?: boolean;
      inputData?: WorkOrderCreateRequest;
    }

    // Los inputs se leen en ngOnInit: hay que fijarlos antes del primer detectChanges.
    function createWith(inputs: Inputs): ComponentFixture<Form> {
      const created = TestBed.createComponent(Form);
      for (const [name, value] of Object.entries(inputs)) {
        created.componentRef.setInput(name, value);
      }
      created.detectChanges();
      return created;
    }

    function typeSelect(target: ComponentFixture<Form>): HTMLSelectElement {
      const select = target.nativeElement.querySelector('#type') as HTMLSelectElement | null;
      if (!select) throw new Error('No se renderizó el select de tipo');
      return select;
    }

    function optionValues(target: ComponentFixture<Form>): string[] {
      return Array.from(typeSelect(target).options).map((option) => option.value);
    }

    const stored: WorkOrderCreateRequest = {
      title: 'Revisar motor',
      description: 'Revisar temperatura del motor',
      asset: 'Motor 1',
      type: 'correctivo',
      priority: 'medium',
    };

    it('offers every order type when the page does not restrict them', () => {
      expect(optionValues(fixture)).toEqual(['preventivo', 'correctivo', 'pronto-intervencion']);
    });

    it('renders only the types the page allows, with their labels', () => {
      expect.assertions(2);
      const restricted = createWith({ allowedTypes: ['pronto-intervencion'] });

      expect(optionValues(restricted)).toEqual(['pronto-intervencion']);
      expect(typeSelect(restricted).options[0]?.textContent?.trim()).toBe('Pronto intervención');
    });

    it('starts on the first allowed type', () => {
      const restricted = createWith({ allowedTypes: ['correctivo', 'preventivo'] });

      expect(restricted.componentInstance.workOrderForm.controls.type.value).toBe('correctivo');
    });

    it('emits the type chosen among the allowed ones', () => {
      expect.assertions(1);
      const restricted = createWith({ allowedTypes: ['preventivo', 'correctivo'] });
      const emit = vi.spyOn(restricted.componentInstance.sendData, 'emit');
      restricted.componentInstance.workOrderForm.setValue({
        ...stored,
        type: 'preventivo',
      });

      restricted.componentInstance.onSubmit();

      expect(emit).toHaveBeenCalledExactlyOnceWith({ ...stored, type: 'preventivo' });
    });

    it('requires a type: with no allowed types it blocks emission and shows the error', () => {
      expect.assertions(3);
      const empty = createWith({ allowedTypes: [] });
      const emit = vi.spyOn(empty.componentInstance.sendData, 'emit');
      empty.componentInstance.workOrderForm.patchValue(stored);
      empty.componentInstance.workOrderForm.controls.type.setValue(null);

      empty.componentInstance.onSubmit();
      empty.detectChanges();

      expect(emit).not.toHaveBeenCalled();
      expect(empty.nativeElement.textContent).toContain('El tipo de orden es obligatorio.');
      expect(typeSelect(empty).getAttribute('aria-describedby')).toBe('type-error');
    });

    it('keeps the stored type of an existing order over the first allowed one', () => {
      const editing = createWith({ inputData: stored, allowedTypes: ['preventivo'] });

      expect(editing.componentInstance.workOrderForm.controls.type.value).toBe('correctivo');
    });

    describe('lockType', () => {
      it('leaves the select enabled by default', () => {
        expect(typeSelect(fixture).disabled).toBe(false);
      });

      it('disables the select but keeps showing the stored type', () => {
        expect.assertions(2);
        const locked = createWith({ inputData: stored, lockType: true });

        expect(typeSelect(locked).disabled).toBe(true);
        expect(typeSelect(locked).value).toBe('correctivo');
      });

      it('still emits the original type when the locked form is submitted', () => {
        expect.assertions(1);
        const locked = createWith({ inputData: stored, lockType: true });
        const emit = vi.spyOn(locked.componentInstance.sendData, 'emit');

        locked.componentInstance.onSubmit();

        expect(emit).toHaveBeenCalledExactlyOnceWith(stored);
      });
    });
  });
});
