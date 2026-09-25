import { Component, computed, input, output } from '@angular/core';

import { PartTree } from '@features/machines/components/part-tree/part-tree';
import { Machine } from '@features/machines/models/machine.model';
import { buildBreadcrumb, flattenPartTree, PartNode } from '@features/machines/models/part.model';
import { Button } from '@shared/components/button/button';

// Selector de máquina y parte para crear una orden (spec 013d). Es PRESENTACIONAL, como `PartTree`:
// recibe las máquinas y los nodos de la máquina elegida, y emite lo que el usuario elige; no hace
// HTTP ni consulta permisos. La página carga las partes cuando llega `machineChange` (CLAUDE.md: los
// servicios encapsulan HTTP, las páginas coordinan).
//
// Se puede parar en cualquier nivel: solo la máquina ("Usar solo la máquina" limpia la parte) o hasta
// la hoja más profunda. Cambiar de máquina limpia la parte, que pertenecía a la anterior.
@Component({
  selector: 'app-machine-part-picker',
  imports: [PartTree, Button],
  templateUrl: './machine-part-picker.html',
  styleUrl: './machine-part-picker.scss',
})
export class MachinePartPicker {
  readonly machines = input.required<readonly Machine[]>();
  // Partes ya armadas (`buildPartTree`) de la máquina elegida.
  readonly nodes = input<readonly PartNode[]>([]);
  readonly machineId = input<string | null>(null);
  readonly partId = input<string | null>(null);
  // El error lo muestra quien tiene el formulario; acá solo se marca el control y se lo enlaza.
  readonly invalid = input(false);
  readonly errorId = input<string | null>(null);

  readonly machineChange = output<string | null>();
  readonly partChange = output<string | null>();

  readonly machine = computed(
    () => this.machines().find((candidate) => candidate.id === this.machineId()) ?? null,
  );

  // Vista previa de la ruta elegida. Es solo para mostrarla: el `breadcrumb` que se guarda en la
  // orden lo arma la página al enviar, con la misma función.
  readonly selectedPath = computed(() => {
    const machine = this.machine();

    if (!machine) {
      return null;
    }

    const parts = flattenPartTree(this.nodes()).map((flat) => flat.part);

    return buildBreadcrumb(machine, this.partId(), parts);
  });

  onMachineSelected(select: HTMLSelectElement): void {
    const machineId = select.value === '' ? null : select.value;

    this.machineChange.emit(machineId);

    if (this.partId() !== null) {
      this.partChange.emit(null);
    }
  }

  onPartSelected(node: PartNode): void {
    this.partChange.emit(node.part.id);
  }

  useMachineOnly(): void {
    this.partChange.emit(null);
  }
}
