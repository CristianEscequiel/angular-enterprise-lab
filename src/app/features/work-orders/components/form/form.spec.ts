import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Machine } from '@features/machines/models/machine.model';
import { buildPartTree, Part } from '@features/machines/models/part.model';
import { WorkOrderCreateRequest, WorkOrderType } from '../../models/work-order.model';
import { MACHINE_REF_FIXTURE } from '../../testing/work-order.fixtures';
import { Form, MACHINE_COMMENT_MAX_LENGTH, WorkOrderFormValue } from './form';

const MACHINES: Machine[] = [
  { id: '1', code: 'ENV-01', name: 'Envasadora línea 1' },
  { id: '2', code: 'SEL-02', name: 'Selladora' },
];

const PARTS: Part[] = [
  { id: '1', machineId: '1', parentId: null, name: 'Mesa de transporte' },
  { id: '2', machineId: '1', parentId: '1', name: 'Cinta 1' },
  { id: '3', machineId: '1', parentId: '2', name: 'Motor de cinta' },
];

describe('Form', () => {
  let component: Form;
  let fixture: ComponentFixture<Form>;

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]');
  }

  const validValue: WorkOrderFormValue = {
    title: 'Revisar motor',
    description: 'Revisar temperatura del motor',
    machineId: '1',
    partId: null,
    comment: '',
    type: 'correctivo',
    priority: 'medium',
  };

  function fillValidValues(): void {
    component.workOrderForm.setValue(validValue);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Form],
    }).compileComponents();

    fixture = TestBed.createComponent(Form);
    fixture.componentRef.setInput('machines', MACHINES);
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

    expect(emit).toHaveBeenCalledExactlyOnceWith(validValue);
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

  describe('machine and part (spec 013d)', () => {
    const machineSelect = (): HTMLSelectElement =>
      fixture.nativeElement.querySelector('#machine-select') as HTMLSelectElement;

    function chooseMachine(id: string): void {
      machineSelect().value = id;
      machineSelect().dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    function withTree(): void {
      fixture.componentRef.setInput('partNodes', buildPartTree(PARTS).roots);
      fixture.detectChanges();
    }

    it('blocks the submit without a machine and shows a visible, linked validation error', () => {
      expect.assertions(5);
      const emit = vi.spyOn(component.sendData, 'emit');
      component.workOrderForm.patchValue({ ...validValue, machineId: '' });

      component.onSubmit();
      fixture.detectChanges();

      expect(emit).not.toHaveBeenCalled();
      expect(component.workOrderForm.controls.machineId.invalid).toBe(true);
      expect(fixture.nativeElement.querySelector('#machine-error')?.textContent).toContain(
        'Seleccioná una máquina.',
      );
      expect(machineSelect().getAttribute('aria-invalid')).toBe('true');
      expect(machineSelect().getAttribute('aria-describedby')).toBe('machine-error');
    });

    it('lets the user stop at the machine: emits partId null', () => {
      expect.assertions(1);
      const emit = vi.spyOn(component.sendData, 'emit');
      fillValidValues();
      chooseMachine('1');

      component.onSubmit();

      expect(emit).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ machineId: '1', partId: null }),
      );
    });

    it('emits machine, part and comment as separate fields (no breadcrumb, comment not merged)', () => {
      expect.assertions(2);
      const emit = vi.spyOn(component.sendData, 'emit');
      fillValidValues();
      chooseMachine('1');
      withTree();
      const motor = Array.from(
        fixture.nativeElement.querySelectorAll('.part-tree__name') as NodeListOf<HTMLElement>,
      ).find((button) => button.textContent?.trim() === 'Motor de cinta');
      motor?.click();
      fixture.detectChanges();
      component.workOrderForm.controls.comment.setValue('Vibración en el arranque');

      component.onSubmit();

      expect(emit).toHaveBeenCalledExactlyOnceWith({
        ...validValue,
        machineId: '1',
        partId: '3',
        comment: 'Vibración en el arranque',
      });
      expect(Object.keys(emit.mock.calls[0]?.[0] ?? {})).not.toContain('breadcrumb');
    });

    it('announces the machine to the page and clears the part when the machine changes', () => {
      expect.assertions(3);
      const changes: (string | null)[] = [];
      component.machineChange.subscribe((id) => changes.push(id));
      fillValidValues();
      component.workOrderForm.controls.partId.setValue('3');

      chooseMachine('2');

      expect(changes).toEqual(['2']);
      expect(component.workOrderForm.controls.machineId.value).toBe('2');
      expect(component.workOrderForm.controls.partId.value).toBeNull();
    });

    it(`rejects a comment longer than ${MACHINE_COMMENT_MAX_LENGTH} characters`, () => {
      expect.assertions(3);
      const emit = vi.spyOn(component.sendData, 'emit');
      fillValidValues();
      component.workOrderForm.controls.comment.setValue('x'.repeat(MACHINE_COMMENT_MAX_LENGTH + 1));

      component.onSubmit();
      fixture.detectChanges();

      expect(emit).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('#comment-error')).toBeTruthy();
      expect(
        (fixture.nativeElement.querySelector('#comment') as HTMLTextAreaElement).maxLength,
      ).toBe(MACHINE_COMMENT_MAX_LENGTH);
    });

    it('accepts an empty comment (it is optional)', () => {
      const emit = vi.spyOn(component.sendData, 'emit');
      fillValidValues();

      component.onSubmit();

      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('goes back to "no machine" (and clears the part) when the placeholder is chosen again', () => {
      component.workOrderForm.patchValue({ machineId: '1', partId: '3' });

      component.onMachineChange(null);

      expect(component.workOrderForm.controls.machineId.value).toBe('');
      expect(component.workOrderForm.controls.partId.value).toBeNull();
      expect(component.workOrderForm.controls.machineId.invalid).toBe(true);
    });

    it('shows an empty path when it is locked without an order loaded', () => {
      const locked = TestBed.createComponent(Form);
      locked.componentRef.setInput('lockMachine', true);
      locked.detectChanges();

      expect(locked.componentInstance.lockedBreadcrumb()).toBe('');
    });

    describe('lockMachine', () => {
      const stored: WorkOrderCreateRequest = {
        title: 'Revisar motor',
        description: 'Revisar temperatura del motor',
        machineRef: MACHINE_REF_FIXTURE,
        type: 'correctivo',
        priority: 'medium',
      };

      function createLocked(): ComponentFixture<Form> {
        const locked = TestBed.createComponent(Form);
        locked.componentRef.setInput('inputData', stored);
        locked.componentRef.setInput('lockMachine', true);
        locked.detectChanges();
        return locked;
      }

      it('shows the stored path and comment, without a machine selector or comment field', () => {
        expect.assertions(4);
        const locked = createLocked();

        expect(locked.nativeElement.querySelector('#machine-select')).toBeNull();
        expect(locked.nativeElement.querySelector('#comment')).toBeNull();
        expect(locked.nativeElement.querySelector('#machine-locked')?.textContent).toContain(
          MACHINE_REF_FIXTURE.breadcrumb,
        );
        expect(locked.nativeElement.querySelector('#comment-locked')?.textContent).toContain(
          MACHINE_REF_FIXTURE.comment,
        );
      });

      it('does not block the submit for lack of machine, and emits the stored reference', () => {
        expect.assertions(1);
        const locked = createLocked();
        const emit = vi.spyOn(locked.componentInstance.sendData, 'emit');

        locked.componentInstance.onSubmit();

        expect(emit).toHaveBeenCalledExactlyOnceWith({
          title: stored.title,
          description: stored.description,
          machineId: MACHINE_REF_FIXTURE.machineId,
          partId: MACHINE_REF_FIXTURE.partId,
          comment: MACHINE_REF_FIXTURE.comment,
          type: 'correctivo',
          priority: 'medium',
        });
      });
    });
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
      machineRef: MACHINE_REF_FIXTURE,
      type: 'correctivo',
      priority: 'medium',
    };

    // Lo que emite el formulario con `stored` cargado.
    const storedValue: WorkOrderFormValue = {
      title: stored.title,
      description: stored.description,
      machineId: MACHINE_REF_FIXTURE.machineId,
      partId: MACHINE_REF_FIXTURE.partId,
      comment: MACHINE_REF_FIXTURE.comment,
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
        ...storedValue,
        type: 'preventivo',
      });

      restricted.componentInstance.onSubmit();

      expect(emit).toHaveBeenCalledExactlyOnceWith({ ...storedValue, type: 'preventivo' });
    });

    it('requires a type: with no allowed types it blocks emission and shows the error', () => {
      expect.assertions(3);
      const empty = createWith({ allowedTypes: [] });
      const emit = vi.spyOn(empty.componentInstance.sendData, 'emit');
      empty.componentInstance.workOrderForm.patchValue(storedValue);
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

        expect(emit).toHaveBeenCalledExactlyOnceWith(storedValue);
      });
    });
  });
});
