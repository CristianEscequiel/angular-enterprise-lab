import { NgTemplateOutlet } from '@angular/common';
import { Component, input, model, output, signal } from '@angular/core';

import { Button } from '@shared/components/button/button';
import { PartNode } from '../../models/part.model';

// Árbol de partes de una máquina. Es PRESENTACIONAL: recibe los nodos ya armados (`buildPartTree`) y
// emite lo que el usuario hace; no consulta permisos ni hace HTTP, y no decide qué significa cada
// acción (eso es de la página: CLAUDE.md). Por eso lo pueden reutilizar dos páginas:
//   - la gestión de la máquina (spec 013a): `showActions` en true, con agregar/editar/eliminar;
//   - la creación de una orden (spec 013d): `showActions` en false, solo para elegir una parte.
// Emite el `PartNode` (no solo la `Part`): quien lo recibe sabe si es una hoja (`children` vacío).
//
// Es recursivo con `ng-template` y sin límite de niveles. Roles ARIA de árbol (`tree`/`group`/
// `treeitem`, `aria-level`, `aria-expanded`); la navegación con flechas queda fuera de alcance, cada
// control es un botón enfocable.
@Component({
  selector: 'app-part-tree',
  imports: [NgTemplateOutlet, Button],
  templateUrl: './part-tree.html',
  styleUrl: './part-tree.scss',
})
export class PartTree {
  readonly nodes = input.required<readonly PartNode[]>();
  // La parte elegida. `model`: la página puede fijarla (`[(selectedId)]`) o solo escucharla.
  readonly selectedId = model<string | null>(null);
  readonly showActions = input(false);
  readonly label = input('Partes');
  readonly emptyMessage = input('Esta máquina todavía no tiene partes.');

  readonly selectPart = output<PartNode>();
  readonly addChild = output<PartNode>();
  readonly editPart = output<PartNode>();
  readonly deletePart = output<PartNode>();

  // Se guardan los ids CONTRAÍDOS: por defecto todo está expandido, y al recargar el árbol tras un
  // cambio (los `nodes` son objetos nuevos) cada nodo conserva si el usuario lo había contraído.
  private readonly collapsedIds = signal<ReadonlySet<string>>(new Set());

  isCollapsed(node: PartNode): boolean {
    return this.collapsedIds().has(node.part.id);
  }

  toggle(node: PartNode): void {
    this.collapsedIds.update((current) => {
      const next = new Set(current);

      if (!next.delete(node.part.id)) {
        next.add(node.part.id);
      }

      return next;
    });
  }

  select(node: PartNode): void {
    this.selectedId.set(node.part.id);
    this.selectPart.emit(node);
  }
}
