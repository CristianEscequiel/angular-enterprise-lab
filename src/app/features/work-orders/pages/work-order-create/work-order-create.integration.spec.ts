import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthUser } from '@core/auth/auth.model';
import { AuthService } from '@core/auth/auth.service';
import { createInMemoryApi, InMemoryApi, provideInMemoryApi } from '@core/testing/in-memory-api';
import { PartsService } from '@features/machines/data-access/parts.service';
import { Form } from '../../components/form/form';
import { WorkOrdersService } from '../../data-access/work-order.service';
import db from '../../data-access/db.json';
import { WorkOrder } from '../../models/work-order.model';
import { WorkOrderCreate } from './work-order-create';

// Especificación ejecutable de los criterios de aceptación de 013d (máquina y parte en la orden). La
// página `WorkOrderCreate` REAL, con `MachinesService`, `PartsService` y `WorkOrdersService` reales,
// contra un emulador fiel de JSON Server sembrado con las máquinas y partes de `db.json`. La máquina
// y la parte se eligen en el DOM (selector y árbol), como lo haría una persona; el resto del
// formulario se completa por sus controles.
//
// Seed (máquina 1, "Envasadora línea 1"):
//   Mesa de transporte ─ Cinta 1 ─ Motor de cinta ─ Rodamiento delantero
describe('work order machine reference, end to end against an in-memory JSON Server', () => {
  let api: InMemoryApi;
  let fixture: ComponentFixture<WorkOrderCreate>;
  let orders: WorkOrdersService;
  let parts: PartsService;

  const teamLeader: AuthUser = {
    id: '3',
    username: 'teamleader',
    displayName: 'Team Leader',
    email: 'teamleader@enterprise-lab.dev',
    role: 'team-leader-mantenimiento',
  };

  const seed = {
    maquinas: db.maquinas,
    partes: db.partes,
    'work-orders': [],
  } as unknown as Parameters<typeof createInMemoryApi>[0];

  beforeEach(async () => {
    api = createInMemoryApi(seed);

    await TestBed.configureTestingModule({
      imports: [WorkOrderCreate],
      providers: [
        provideInMemoryApi(api),
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { currentUser: signal<AuthUser | null>(teamLeader) } },
      ],
    }).compileComponents();

    orders = TestBed.inject(WorkOrdersService);
    parts = TestBed.inject(PartsService);
    fixture = TestBed.createComponent(WorkOrderCreate);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  const host = (): HTMLElement => fixture.nativeElement;
  const form = (): Form => fixture.debugElement.query(By.directive(Form)).componentInstance;

  function chooseMachine(id: string): void {
    const select = host().querySelector('#machine-select') as HTMLSelectElement;

    select.value = id;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function choosePart(name: string): void {
    const button = Array.from(host().querySelectorAll<HTMLButtonElement>('.part-tree__name')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );

    if (!button) throw new Error(`No hay la parte "${name}" en el árbol`);
    button.click();
    fixture.detectChanges();
  }

  function fillRest(comment = ''): void {
    form().workOrderForm.patchValue({
      title: 'Revisar motor',
      description: 'Revisar temperatura del motor',
      comment,
      type: 'correctivo',
      priority: 'medium',
    });
  }

  const posts = () => api.requestsTo('POST', '/work-orders');
  const storedOrders = (): WorkOrder[] => api.db['work-orders'] as unknown as WorkOrder[];

  async function submit(): Promise<void> {
    form().onSubmit();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('blocks the submit without a machine: no request reaches the server', async () => {
    expect.assertions(2);
    fillRest();

    await submit();

    expect(posts()).toHaveLength(0);
    expect(storedOrders()).toHaveLength(0);
  });

  it('stopping at the machine stores partId null and the machine name as breadcrumb', async () => {
    expect.assertions(2);
    fillRest();
    chooseMachine('1');

    await submit();

    expect(storedOrders()).toHaveLength(1);
    expect(storedOrders()[0]?.machineRef).toEqual({
      machineId: '1',
      partId: null,
      breadcrumb: 'Envasadora línea 1',
      comment: '',
    });
  });

  it('a level-3 part stores the full chain of ancestors, in order', async () => {
    expect.assertions(1);
    fillRest();
    chooseMachine('1');
    choosePart('Motor de cinta');

    await submit();

    expect(storedOrders()[0]?.machineRef).toMatchObject({
      machineId: '1',
      partId: '3',
      breadcrumb: 'Envasadora línea 1 > Mesa de transporte > Cinta 1 > Motor de cinta',
    });
  });

  it('a level-4 leaf stores the four levels', async () => {
    expect.assertions(1);
    fillRest();
    chooseMachine('1');
    choosePart('Rodamiento delantero');

    await submit();

    expect(storedOrders()[0]?.machineRef.breadcrumb).toBe(
      'Envasadora línea 1 > Mesa de transporte > Cinta 1 > Motor de cinta > Rodamiento delantero',
    );
  });

  it('after picking a part, "Usar solo la máquina" goes back to the machine level', async () => {
    expect.assertions(1);
    fillRest();
    chooseMachine('1');
    choosePart('Motor de cinta');
    const onlyMachine = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.includes('Usar solo la máquina'),
    );
    onlyMachine?.click();
    fixture.detectChanges();

    await submit();

    expect(storedOrders()[0]?.machineRef).toMatchObject({ partId: null });
  });

  it('keeps the failure comment as its own field, never inside the stored breadcrumb', async () => {
    expect.assertions(3);
    fillRest('Vibración en el arranque');
    chooseMachine('1');
    choosePart('Motor de cinta');

    await submit();

    const { machineRef } = storedOrders()[0] as WorkOrder;
    expect(machineRef.comment).toBe('Vibración en el arranque');
    expect(machineRef.breadcrumb).not.toContain('Vibración');
    expect(Object.keys(storedOrders()[0] as object)).not.toContain('comment');
  });

  it('an order already created keeps the original breadcrumb after the part is renamed in the master', async () => {
    expect.assertions(4);
    fillRest();
    chooseMachine('1');
    choosePart('Motor de cinta');
    await submit();
    const original = 'Envasadora línea 1 > Mesa de transporte > Cinta 1 > Motor de cinta';
    const id = (storedOrders()[0] as WorkOrder).id;

    // Se renombra la parte elegida y también uno de sus ancestros.
    await firstValueFrom(parts.update('3', 'Motor de cinta (reemplazado)'));
    await firstValueFrom(parts.update('2', 'Cinta principal'));

    const reread = await firstValueFrom(orders.getById(id));
    expect(reread.machineRef.breadcrumb).toBe(original);
    expect(reread.machineRef.partId).toBe('3');
    // El maestro sí cambió: el snapshot no depende de él.
    const renamed = (api.db['partes'] ?? []).find((part) => part.id === '3');
    expect(renamed?.['name']).toBe('Motor de cinta (reemplazado)');
    expect((await firstValueFrom(orders.getAll()))[0]?.machineRef.breadcrumb).toBe(original);
  });
});
