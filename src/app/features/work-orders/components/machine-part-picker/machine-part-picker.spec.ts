import { HttpClient } from '@angular/common/http';
import { ProviderToken } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthService } from '@core/auth/auth.service';
import { Machine } from '@features/machines/models/machine.model';
import { buildPartTree, Part, PartNode } from '@features/machines/models/part.model';
import { MachinePartPicker } from './machine-part-picker';

const MACHINES: Machine[] = [
  { id: 'm1', code: 'ENV-01', name: 'Envasadora línea 1' },
  { id: 'm2', code: 'ROT-03', name: 'Rotuladora' },
];

const part = (id: string, parentId: string | null, name: string): Part => ({
  id,
  machineId: 'm1',
  parentId,
  name,
});

// Mesa de transporte ─ Cinta 1 ─ Motor de cinta ─ Rodamiento (4 niveles)
const PARTS: Part[] = [
  part('1', null, 'Mesa de transporte'),
  part('2', '1', 'Cinta 1'),
  part('3', '2', 'Motor de cinta'),
  part('4', '3', 'Rodamiento'),
];

describe('MachinePartPicker', () => {
  let fixture: ComponentFixture<MachinePartPicker>;
  let component: MachinePartPicker;

  const machineChange = vi.fn<(value: string | null) => void>();
  const partChange = vi.fn<(value: string | null) => void>();

  // Presentacional: no debe inyectar HTTP ni auth. Se registran como proveedores que LANZAN si
  // alguien los instancia (mismo criterio que el test de `PartTree`).
  const forbidden = (token: ProviderToken<unknown>, name: string) => ({
    provide: token,
    useFactory: () => {
      throw new Error(`MachinePartPicker no debe inyectar ${name}`);
    },
  });

  beforeEach(async () => {
    machineChange.mockReset();
    partChange.mockReset();

    await TestBed.configureTestingModule({
      imports: [MachinePartPicker],
      providers: [forbidden(HttpClient, 'HttpClient'), forbidden(AuthService, 'AuthService')],
    }).compileComponents();

    fixture = TestBed.createComponent(MachinePartPicker);
    component = fixture.componentInstance;
    component.machineChange.subscribe(machineChange);
    component.partChange.subscribe(partChange);
  });

  function render(inputs: {
    machineId?: string | null;
    partId?: string | null;
    nodes?: readonly PartNode[];
    invalid?: boolean;
    errorId?: string | null;
  }): void {
    fixture.componentRef.setInput('machines', MACHINES);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  const host = (): HTMLElement => fixture.nativeElement;
  const select = (): HTMLSelectElement =>
    host().querySelector('#machine-select') as HTMLSelectElement;
  const treeButton = (name: string): HTMLButtonElement => {
    const found = Array.from(host().querySelectorAll<HTMLButtonElement>('.part-tree__name')).find(
      (button) => button.textContent?.trim() === name,
    );

    if (!found) throw new Error(`No hay la parte "${name}"`);
    return found;
  };
  const onlyMachineButton = (): HTMLButtonElement | undefined =>
    Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Usar solo la máquina'),
    );

  it('offers a placeholder and every machine, and shows no tree until one is chosen', () => {
    render({});

    expect(Array.from(select().options).map((option) => option.value)).toEqual(['', 'm1', 'm2']);
    expect(host().querySelector('app-part-tree')).toBeNull();
  });

  it('emits the machine id when one is chosen', () => {
    render({});

    select().value = 'm1';
    select().dispatchEvent(new Event('change'));

    expect(machineChange).toHaveBeenCalledExactlyOnceWith('m1');
    // Sin parte elegida todavía, no hay nada que limpiar.
    expect(partChange).not.toHaveBeenCalled();
  });

  it('emits null when the placeholder is chosen again', () => {
    render({ machineId: 'm1' });

    select().value = '';
    select().dispatchEvent(new Event('change'));

    expect(machineChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('clears the part when the machine changes: the part belonged to the previous machine', () => {
    render({ machineId: 'm1', partId: '3', nodes: buildPartTree(PARTS).roots });

    select().value = 'm2';
    select().dispatchEvent(new Event('change'));

    expect(machineChange).toHaveBeenCalledExactlyOnceWith('m2');
    expect(partChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('emits the part when one at level 3 is clicked and marks it as selected', () => {
    render({ machineId: 'm1', nodes: buildPartTree(PARTS).roots });

    treeButton('Motor de cinta').click();
    expect(partChange).toHaveBeenCalledExactlyOnceWith('3');

    fixture.componentRef.setInput('partId', '3');
    fixture.detectChanges();

    const selected = host().querySelector('[aria-selected="true"]');
    expect(selected?.querySelector('.part-tree__name')?.textContent?.trim()).toBe('Motor de cinta');
  });

  it('lets the user stop at the machine: "Usar solo la máquina" clears the part', () => {
    render({ machineId: 'm1', partId: '3', nodes: buildPartTree(PARTS).roots });

    onlyMachineButton()?.click();

    expect(partChange).toHaveBeenCalledExactlyOnceWith(null);
  });

  it('disables "Usar solo la máquina" while no part is selected', () => {
    render({ machineId: 'm1', partId: null, nodes: buildPartTree(PARTS).roots });

    expect(onlyMachineButton()?.disabled).toBe(true);
  });

  it('shows the empty message for a machine without parts, and the machine-only option stays', () => {
    render({ machineId: 'm2', nodes: [] });

    expect(host().textContent).toContain('no tiene partes');
    expect(onlyMachineButton()).toBeDefined();
    expect(host().querySelector('.part-tree__name')).toBeNull();
  });

  it('previews the chosen path: just the machine, or the full chain of ancestors', () => {
    render({ machineId: 'm1', partId: null, nodes: buildPartTree(PARTS).roots });
    expect(host().querySelector('.machine-part-picker__path')?.textContent).toContain(
      'Seleccionado: Envasadora línea 1',
    );

    fixture.componentRef.setInput('partId', '3');
    fixture.detectChanges();
    expect(host().querySelector('.machine-part-picker__path')?.textContent).toContain(
      'Envasadora línea 1 > Mesa de transporte > Cinta 1 > Motor de cinta',
    );
  });

  it('has no path to preview without a machine', () => {
    render({});

    expect(component.selectedPath()).toBeNull();
  });

  it('shows no path when the selected part is not among the loaded ones', () => {
    render({ machineId: 'm1', partId: '999', nodes: buildPartTree(PARTS).roots });

    expect(component.selectedPath()).toBeNull();
    expect(host().querySelector('.machine-part-picker__path')?.textContent?.trim()).toBe('');
  });

  it('has no add/edit/delete buttons (showActions is off)', () => {
    render({ machineId: 'm1', nodes: buildPartTree(PARTS).roots });

    const labels = Array.from(host().querySelectorAll('button')).map(
      (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
    );

    expect(labels.some((label) => /Agregar|Editar|Eliminar/.test(label))).toBe(false);
  });

  it('marks the select as invalid and links it to the error only when invalid', () => {
    render({ invalid: true, errorId: 'machine-error' });
    expect(select().getAttribute('aria-invalid')).toBe('true');
    expect(select().getAttribute('aria-describedby')).toBe('machine-error');

    fixture.componentRef.setInput('invalid', false);
    fixture.detectChanges();
    expect(select().getAttribute('aria-invalid')).toBe('false');
    expect(select().getAttribute('aria-describedby')).toBeNull();
  });
});
