import { HttpClient } from '@angular/common/http';
import { ProviderToken } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';

import { buildPartTree, Part, PartNode } from '../../models/part.model';
import { PartTree } from './part-tree';

const part = (id: string, parentId: string | null, name: string): Part => ({
  id,
  machineId: 'm1',
  parentId,
  name,
});

// Árbol de referencia (5 niveles):
//   Mesa de transporte
//   ├─ Cinta 1 ─ Motor de cinta ─ Rodamiento ─ Sello
//   └─ Cinta 2                        (hoja hermana de "Cinta 1")
//   Cabezal de sellado
const PARTS: Part[] = [
  part('1', null, 'Mesa de transporte'),
  part('2', '1', 'Cinta 1'),
  part('3', '2', 'Motor de cinta'),
  part('4', '3', 'Rodamiento'),
  part('5', '4', 'Sello'),
  part('6', '1', 'Cinta 2'),
  part('7', null, 'Cabezal de sellado'),
];

describe('PartTree', () => {
  let fixture: ComponentFixture<PartTree>;
  let component: PartTree;

  // El componente es presentacional: no debe depender de auth, http, el router ni los avisos. Esos
  // servicios se proveen en `root`, así que "no proveerlos" no impide inyectarlos: se registran como
  // proveedores que LANZAN si alguien los instancia. Si al componente se le inyecta uno, todos los
  // tests de este archivo fallan.
  const forbidden = (token: ProviderToken<unknown>, name: string) => ({
    provide: token,
    useFactory: () => {
      throw new Error(`PartTree no debe inyectar ${name}`);
    },
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PartTree],
      providers: [
        forbidden(HttpClient, 'HttpClient'),
        forbidden(AuthService, 'AuthService'),
        forbidden(Router, 'Router'),
        forbidden(MessageService, 'MessageService'),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PartTree);
    component = fixture.componentInstance;
  });

  function render(nodes: readonly PartNode[] = buildPartTree(PARTS).roots, inputs = {}): void {
    fixture.componentRef.setInput('nodes', nodes);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  const host = (): HTMLElement => fixture.nativeElement;
  const items = (): HTMLElement[] => Array.from(host().querySelectorAll('[role="treeitem"]'));

  // El `treeitem` cuyo nombre (su propio botón, no el de sus descendientes) es `name`.
  function item(name: string): HTMLElement {
    const found = items().find(
      (element) =>
        element.querySelector(':scope > .part-tree__row .part-tree__name')?.textContent?.trim() ===
        name,
    );

    if (!found) {
      throw new Error(`No se renderizó la parte "${name}"`);
    }
    return found;
  }

  const namesShown = (): string[] =>
    Array.from(host().querySelectorAll('.part-tree__name')).map(
      (el) => el.textContent?.trim() ?? '',
    );

  const rowButton = (name: string, selector: string): HTMLButtonElement => {
    const button = item(name).querySelector<HTMLButtonElement>(
      `:scope > .part-tree__row ${selector}`,
    );

    if (!button) {
      throw new Error(`"${name}" no tiene ${selector}`);
    }
    return button;
  };

  const click = (element: HTMLElement): void => {
    element.click();
    fixture.detectChanges();
  };

  const actionButton = (name: string, label: string): HTMLButtonElement => {
    const button = item(name).querySelector<HTMLButtonElement>(
      `:scope > .part-tree__row button[aria-label="${label}"]`,
    );

    if (!button) {
      throw new Error(`No hay un botón "${label}"`);
    }
    return button;
  };

  it('depends on no service: auth, http, router and messages are off limits', () => {
    render();

    expect(component).toBeTruthy();
    expect(items()).toHaveLength(7);
  });

  describe('rendering', () => {
    it('renders every level: a 5-level tree shows aria-level 1 to 5', () => {
      render();

      const levelOf = (name: string) => item(name).getAttribute('aria-level');

      expect(levelOf('Mesa de transporte')).toBe('1');
      expect(levelOf('Cinta 1')).toBe('2');
      expect(levelOf('Motor de cinta')).toBe('3');
      expect(levelOf('Rodamiento')).toBe('4');
      expect(levelOf('Sello')).toBe('5');
      expect(levelOf('Cinta 2')).toBe('2');
      expect(levelOf('Cabezal de sellado')).toBe('1');
    });

    it('puts each part inside its parent group, not just visually indented', () => {
      render();

      const parentOf = (name: string): HTMLElement | null =>
        item(name).parentElement?.closest('[role="treeitem"]') ?? null;
      const nameOf = (element: HTMLElement | null) =>
        element?.querySelector(':scope > .part-tree__row .part-tree__name')?.textContent?.trim();

      expect(nameOf(parentOf('Sello'))).toBe('Rodamiento');
      expect(nameOf(parentOf('Rodamiento'))).toBe('Motor de cinta');
      expect(nameOf(parentOf('Motor de cinta'))).toBe('Cinta 1');
      expect(nameOf(parentOf('Cinta 1'))).toBe('Mesa de transporte');
      expect(nameOf(parentOf('Cinta 2'))).toBe('Mesa de transporte');
      expect(parentOf('Mesa de transporte')).toBeNull();
      expect(parentOf('Cabezal de sellado')).toBeNull();
    });

    it('lists the parts in hierarchical, depth-first order', () => {
      render();

      expect(namesShown()).toEqual([
        'Mesa de transporte',
        'Cinta 1',
        'Motor de cinta',
        'Rodamiento',
        'Sello',
        'Cinta 2',
        'Cabezal de sellado',
      ]);
    });

    it('uses the tree/group roles: one tree, one group per parent', () => {
      render();

      expect(host().querySelectorAll('[role="tree"]')).toHaveLength(1);
      // Mesa, Cinta 1, Motor de cinta y Rodamiento tienen hijos.
      expect(host().querySelectorAll('[role="group"]')).toHaveLength(4);
    });

    it('labels the tree, with a default that the page can override', () => {
      render();
      expect(host().querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('Partes');

      fixture.componentRef.setInput('label', 'Partes de la Envasadora');
      fixture.detectChanges();
      expect(host().querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe(
        'Partes de la Envasadora',
      );
    });

    it('is not limited in depth: 30 nested levels are rendered', () => {
      const chain = Array.from({ length: 30 }, (_, index) =>
        part(String(index), index === 0 ? null : String(index - 1), `Nivel ${index + 1}`),
      );

      render(buildPartTree(chain).roots);

      expect(items()).toHaveLength(30);
      expect(item('Nivel 30').getAttribute('aria-level')).toBe('30');
    });

    it('updates when the nodes change', () => {
      render();

      render(buildPartTree([part('9', null, 'Otra raíz')]).roots);

      expect(namesShown()).toEqual(['Otra raíz']);
    });
  });

  describe('leaves and parents', () => {
    it('gives a leaf no expand control and no aria-expanded', () => {
      render();

      for (const leaf of ['Sello', 'Cinta 2', 'Cabezal de sellado']) {
        expect(item(leaf).querySelector(':scope > .part-tree__row .part-tree__toggle')).toBeNull();
        expect(item(leaf).hasAttribute('aria-expanded')).toBe(false);
      }
    });

    it('gives a parent an expand control and aria-expanded="true" by default', () => {
      render();

      for (const parent of ['Mesa de transporte', 'Cinta 1', 'Motor de cinta', 'Rodamiento']) {
        expect(rowButton(parent, '.part-tree__toggle')).toBeTruthy();
        expect(item(parent).getAttribute('aria-expanded')).toBe('true');
      }
    });
  });

  describe('collapsing', () => {
    it('hides ALL the descendants of a collapsed node, at every depth', () => {
      render();

      click(rowButton('Cinta 1', '.part-tree__toggle'));

      expect(namesShown()).toEqual([
        'Mesa de transporte',
        'Cinta 1',
        'Cinta 2',
        'Cabezal de sellado',
      ]);
      expect(item('Cinta 1').getAttribute('aria-expanded')).toBe('false');
    });

    it('expands it again and shows the whole subtree', () => {
      render();

      click(rowButton('Cinta 1', '.part-tree__toggle'));
      click(rowButton('Cinta 1', '.part-tree__toggle'));

      expect(namesShown()).toHaveLength(7);
      expect(item('Cinta 1').getAttribute('aria-expanded')).toBe('true');
    });

    it('collapses only that node: its siblings and ancestors stay as they were', () => {
      render();

      click(rowButton('Cinta 1', '.part-tree__toggle'));

      expect(item('Mesa de transporte').getAttribute('aria-expanded')).toBe('true');
      expect(namesShown()).toContain('Cinta 2');
    });

    it('collapsing an ancestor hides a subtree that had been collapsed on its own, and keeps it collapsed after', () => {
      render();

      click(rowButton('Motor de cinta', '.part-tree__toggle'));
      click(rowButton('Mesa de transporte', '.part-tree__toggle'));
      click(rowButton('Mesa de transporte', '.part-tree__toggle'));

      expect(namesShown()).not.toContain('Rodamiento');
      expect(namesShown()).toContain('Motor de cinta');
    });

    it('labels the toggle with the action and the part name', () => {
      render();

      expect(rowButton('Cinta 1', '.part-tree__toggle').getAttribute('aria-label')).toBe(
        'Contraer Cinta 1',
      );

      click(rowButton('Cinta 1', '.part-tree__toggle'));

      expect(rowButton('Cinta 1', '.part-tree__toggle').getAttribute('aria-label')).toBe(
        'Expandir Cinta 1',
      );
    });

    // Al recargar el árbol tras agregar o borrar una parte, los `nodes` son objetos nuevos.
    it('keeps a node collapsed when the tree is reloaded with new objects', () => {
      render();
      click(rowButton('Cinta 1', '.part-tree__toggle'));

      render(buildPartTree(PARTS.map((each) => ({ ...each }))).roots);

      expect(namesShown()).not.toContain('Motor de cinta');
      expect(item('Cinta 1').getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('selecting', () => {
    it('emits the node of the clicked part and marks it selected', () => {
      const selected: PartNode[] = [];
      component.selectPart.subscribe((node) => selected.push(node));
      render();

      click(rowButton('Motor de cinta', '.part-tree__name'));

      expect(selected).toHaveLength(1);
      expect(selected[0]?.part.id).toBe('3');
      expect(selected[0]?.children.map((child) => child.part.name)).toEqual(['Rodamiento']);
      expect(component.selectedId()).toBe('3');
    });

    it('emits a leaf with no children, so the page can tell it is a leaf', () => {
      const selected: PartNode[] = [];
      component.selectPart.subscribe((node) => selected.push(node));
      render();

      click(rowButton('Sello', '.part-tree__name'));

      expect(selected[0]?.part.name).toBe('Sello');
      expect(selected[0]?.children).toEqual([]);
    });

    it('marks exactly one part with aria-selected="true"', () => {
      render();

      click(rowButton('Cinta 2', '.part-tree__name'));

      const selectedItems = items().filter(
        (element) => element.getAttribute('aria-selected') === 'true',
      );
      expect(selectedItems).toEqual([item('Cinta 2')]);
      expect(item('Mesa de transporte').getAttribute('aria-selected')).toBe('false');
    });

    it('moves the selection when another part is clicked', () => {
      render();

      click(rowButton('Cinta 2', '.part-tree__name'));
      click(rowButton('Sello', '.part-tree__name'));

      expect(item('Cinta 2').getAttribute('aria-selected')).toBe('false');
      expect(item('Sello').getAttribute('aria-selected')).toBe('true');
    });

    it('emits again when the already selected part is clicked (the page decides what it means)', () => {
      const selected: PartNode[] = [];
      component.selectPart.subscribe((node) => selected.push(node));
      render();

      click(rowButton('Cinta 2', '.part-tree__name'));
      click(rowButton('Cinta 2', '.part-tree__name'));

      expect(selected).toHaveLength(2);
    });

    it('starts with nothing selected', () => {
      render();

      expect(items().every((element) => element.getAttribute('aria-selected') === 'false')).toBe(
        true,
      );
      expect(component.selectedId()).toBeNull();
    });

    it('takes the selection from the page (two-way): a part selected from outside is marked', () => {
      render();

      fixture.componentRef.setInput('selectedId', '5');
      fixture.detectChanges();

      expect(item('Sello').getAttribute('aria-selected')).toBe('true');
    });

    it('works with the actions hidden: that is how the order form (013d) uses it', () => {
      const selected: PartNode[] = [];
      component.selectPart.subscribe((node) => selected.push(node));
      render(undefined, { showActions: false });

      click(rowButton('Sello', '.part-tree__name'));

      expect(selected[0]?.part.name).toBe('Sello');
    });
  });

  describe('actions', () => {
    it('shows no add/edit/delete button when showActions is false (the default)', () => {
      render();

      expect(host().querySelectorAll('app-button')).toHaveLength(0);
      expect(host().querySelector('.part-tree__actions')).toBeNull();
    });

    it('shows three actions per part when showActions is true', () => {
      render(undefined, { showActions: true });

      expect(host().querySelectorAll('app-button')).toHaveLength(7 * 3);
      expect(item('Sello').querySelectorAll(':scope > .part-tree__row app-button')).toHaveLength(3);
    });

    it('labels every action with the part it acts on', () => {
      render(undefined, { showActions: true });

      const labels = Array.from(
        item('Cinta 2').querySelectorAll(':scope > .part-tree__row button[aria-label]'),
      ).map((button) => button.getAttribute('aria-label'));

      expect(labels).toEqual(['Agregar sub-parte a Cinta 2', 'Editar Cinta 2', 'Eliminar Cinta 2']);
    });

    // Un nodo de cada nivel: la acción emite SU nodo, no el de su padre ni el de un hermano.
    describe.each([
      ['Mesa de transporte', '1'],
      ['Motor de cinta', '3'],
      ['Sello', '5'],
      ['Cinta 2', '6'],
    ])('on "%s"', (name, id) => {
      it.each([
        ['addChild', 'Agregar sub-parte a'],
        ['editPart', 'Editar'],
        ['deletePart', 'Eliminar'],
      ] as const)('%s emits its own node', (output, prefix) => {
        const emitted: PartNode[] = [];
        component[output].subscribe((node) => emitted.push(node));
        render(undefined, { showActions: true });

        click(actionButton(name, `${prefix} ${name}`));

        expect(emitted).toHaveLength(1);
        expect(emitted[0]?.part.id).toBe(id);
      });
    });

    it('emits only the clicked action', () => {
      const emitted: string[] = [];
      component.addChild.subscribe(() => emitted.push('add'));
      component.editPart.subscribe(() => emitted.push('edit'));
      component.deletePart.subscribe(() => emitted.push('delete'));
      render(undefined, { showActions: true });

      click(actionButton('Sello', 'Editar Sello'));

      expect(emitted).toEqual(['edit']);
    });

    it('does not select the part when an action is clicked', () => {
      const selected: PartNode[] = [];
      component.selectPart.subscribe((node) => selected.push(node));
      render(undefined, { showActions: true });

      click(actionButton('Sello', 'Eliminar Sello'));
      click(actionButton('Sello', 'Editar Sello'));
      click(actionButton('Sello', 'Agregar sub-parte a Sello'));

      expect(selected).toEqual([]);
      expect(component.selectedId()).toBeNull();
    });

    it('does not remove anything itself: deleting is the page decision, the tree only emits', () => {
      render(undefined, { showActions: true });

      click(actionButton('Cinta 2', 'Eliminar Cinta 2'));

      expect(namesShown()).toContain('Cinta 2');
    });
  });

  describe('empty tree', () => {
    it('shows the empty state and no tree', () => {
      render([]);

      expect(host().textContent).toContain('Esta máquina todavía no tiene partes.');
      expect(host().querySelector('[role="tree"]')).toBeNull();
      expect(items()).toHaveLength(0);
    });

    it('announces the empty state to assistive technology', () => {
      render([]);

      expect(host().querySelector('[role="status"]')?.textContent).toContain(
        'todavía no tiene partes',
      );
    });

    it('lets the page change the message', () => {
      render([], { emptyMessage: 'Sin resultados' });

      expect(host().textContent).toContain('Sin resultados');
    });

    it('switches to the tree as soon as there are nodes', () => {
      render([]);

      render();

      expect(host().querySelector('[role="tree"]')).not.toBeNull();
      expect(host().querySelector('[role="status"]')).toBeNull();
    });
  });
});
