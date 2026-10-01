import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Modal } from '@shared/components/modal/modal';
import { MachineLoadError, MachinesService } from '../../data-access/machines.service';
import {
  MachineNotFoundError,
  ParentPartNotFoundError,
  PartHasChildrenError,
  PartsService,
} from '../../data-access/parts.service';
import { PartTree } from '../../components/part-tree/part-tree';
import { Machine } from '../../models/machine.model';
import { canManageMachines } from '../../models/machines.permissions';
import { buildPartTree, hasChildren, Part, PartNode } from '../../models/part.model';

type LoadError = 'not-found' | 'connection';

// Qué está haciendo el panel en línea: agregar una parte de primer nivel, agregar una sub-parte a un
// nodo, o renombrar uno.
type Editor =
  { kind: 'add-root' } | { kind: 'add-child'; parent: Part } | { kind: 'rename'; part: Part };

// Un nombre de solo espacios no es un nombre: `required` lo deja pasar, esto no.
const HAS_TEXT = /\S/;

// Gestión del árbol de partes de UNA máquina (`/machines/:id/parts`). Toda la lógica de negocio vive
// acá (CLAUDE.md): `PartTree` solo muestra y emite; los servicios protegen la integridad; esta página
// decide el permiso, qué aviso mostrar ante cada error y que tras cada cambio se recarga el árbol
// DESDE EL SERVIDOR (lo que se ve es lo que hay, no una copia que se fue desactualizando).
@Component({
  selector: 'app-machine-parts',
  imports: [ReactiveFormsModule, Alert, Button, Modal, PartTree],
  templateUrl: './machine-parts.html',
})
export class MachineParts implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly machinesService = inject(MachinesService);
  private readonly partsService = inject(PartsService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly machineId = this.route.snapshot.paramMap.get('id');

  // Agregar, renombrar y eliminar partes tiene un solo nivel de permiso (Administrador y
  // TeamLeader). La plantilla oculta las acciones y cada método vuelve a comprobarlo.
  readonly canManage = computed(() => canManageMachines(this.authService.currentUser()));

  readonly machine = signal<Machine | null>(null);
  readonly parts = signal<Part[]>([]);
  readonly loadError = signal<LoadError | null>(null);

  // Se arma desde las raíces: lo que no cuelga de ninguna (datos rotos a mano) va a `orphans` y se
  // muestra aparte, no se pierde de la vista.
  private readonly tree = computed(() => buildPartTree(this.parts()));
  readonly roots = computed(() => this.tree().roots);
  readonly orphans = computed(() => this.tree().orphans);

  readonly selectedId = signal<string | null>(null);
  readonly editor = signal<Editor | null>(null);
  readonly isSubmitting = signal(false);
  readonly partToDelete = signal<Part | null>(null);
  readonly deleteModalOpen = signal(false);

  readonly form = this.fb.group({
    name: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(HAS_TEXT)],
    }),
  });
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  readonly editorTitle = computed(() => {
    const editor = this.editor();

    switch (editor?.kind) {
      case 'add-root':
        return 'Nueva parte de primer nivel';
      case 'add-child':
        return `Nueva sub-parte de "${editor.parent.name}"`;
      case 'rename':
        return `Renombrar "${editor.part.name}"`;
      default:
        return '';
    }
  });

  readonly orphansMessage = computed(() => {
    const count = this.orphans().length;
    const which = count === 1 ? '1 parte no cuelga' : `${count} partes no cuelgan`;

    return `${which} de ninguna parte de esta máquina (su padre no existe o es de otra máquina). Eliminá las que sobren; no se muestran en el árbol.`;
  });

  readonly deleteMessage = computed(() => {
    const part = this.partToDelete();
    const which = part ? `la parte "${part.name}"` : 'la parte';
    const warning =
      part && hasChildren(this.parts(), part.id)
        ? 'Tiene sub-partes: hay que eliminarlas antes. '
        : '';

    return `¿Estás seguro de que querés eliminar ${which}? ${warning}Esta acción no se puede deshacer.`;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.machineId === null) {
      this.loadError.set('not-found');
      return;
    }

    this.loadError.set(null);
    forkJoin({
      machine: this.machinesService.getById(this.machineId),
      parts: this.partsService.getByMachine(this.machineId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ machine, parts }) => {
          this.machine.set(machine);
          this.parts.set(parts);
        },
        error: (error: unknown) =>
          this.loadError.set(
            (error instanceof MachineLoadError && error.kind === 'not-found') ||
              error instanceof MachineNotFoundError
              ? 'not-found'
              : 'connection',
          ),
      });
  }

  // ── Panel en línea ────────────────────────────────────────────────────────────────────────────
  startAddRoot(): void {
    if (!this.allow('crear partes')) return;
    this.openEditor({ kind: 'add-root' }, '');
  }

  startAddChild(node: PartNode): void {
    if (!this.allow('crear partes')) return;
    this.openEditor({ kind: 'add-child', parent: node.part }, '');
  }

  startRename(node: PartNode): void {
    if (!this.allow('modificar partes')) return;
    this.openEditor({ kind: 'rename', part: node.part }, node.part.name);
  }

  cancelEditor(): void {
    this.editor.set(null);
  }

  savePart(): void {
    const editor = this.editor();

    if (this.isSubmitting() || !editor) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name } = this.form.getRawValue();

    switch (editor.kind) {
      case 'add-root':
        this.addPart(null, name);
        break;
      case 'add-child':
        this.addPart(editor.parent.id, name);
        break;
      case 'rename':
        this.renamePart(editor.part.id, name);
        break;
    }
  }

  isNameInvalid(): boolean {
    const control = this.form.controls.name;
    return control.invalid && (control.dirty || control.touched);
  }

  // ── Acciones sobre las partes ─────────────────────────────────────────────────────────────────
  addPart(parentId: string | null, name: string): void {
    if (!this.allow('crear partes')) return;
    if (this.isSubmitting() || this.machineId === null) return;

    const trimmed = name.trim();

    if (trimmed.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.partsService
      .create(this.machineId, parentId, trimmed)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: (created) => {
          this.messageService.showSuccess('Parte creada satisfactoriamente.');
          this.editor.set(null);
          this.selectedId.set(created.id);
          this.refreshParts();
        },
        error: (error: unknown) => this.handleWriteError(error, 'Error al crear la parte.'),
      });
  }

  renamePart(id: string, name: string): void {
    if (!this.allow('modificar partes')) return;
    if (this.isSubmitting()) return;

    const trimmed = name.trim();

    if (trimmed.length === 0) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.parts().find((part) => part.id === id)?.name === trimmed) {
      this.messageService.showWarning('No hubo cambios en la parte');
      return;
    }

    this.isSubmitting.set(true);
    this.partsService
      .update(id, trimmed)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Parte actualizada correctamente.');
          this.editor.set(null);
          this.refreshParts();
        },
        error: (error: unknown) => this.handleWriteError(error, 'Error al actualizar la parte.'),
      });
  }

  openDeleteModal(part: Part): void {
    if (!this.allow('eliminar partes')) return;
    this.partToDelete.set(part);
    this.deleteModalOpen.set(true);
  }

  // No verifica los hijos por su cuenta: la API bloquea el borrado (`409 PART_HAS_CHILDREN`) y
  // `PartsService` lo traduce a `PartHasChildrenError`. Acá solo se traduce el resultado a un aviso.
  deletePart(id: string): void {
    if (!this.allow('eliminar partes')) return;

    this.partsService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Parte eliminada satisfactoriamente.');
          this.forget(id);
          this.refreshParts();
        },
        error: (error: unknown) => {
          if (error instanceof PartHasChildrenError) {
            // Lo que se veía estaba desactualizado (alguien le agregó una sub-parte): se recarga.
            this.messageService.showWarning(error.message, 'No se puede eliminar');
            this.refreshParts();
            return;
          }

          this.handleWriteError(error, 'Error al eliminar la parte.');
        },
      });
  }

  navigateToList(): void {
    this.router.navigate(['/machines']);
  }

  navigateToEdit(): void {
    if (this.machineId !== null) {
      this.router.navigate(['/machines', this.machineId, 'edit']);
    }
  }

  // ── Internos ──────────────────────────────────────────────────────────────────────────────────
  // Recarga solo las partes. Si falla, se deja lo que había y se avisa: no se inventa un árbol.
  private refreshParts(): void {
    if (this.machineId === null) return;

    this.partsService
      .getByMachine(this.machineId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (parts) => this.parts.set(parts),
        error: () =>
          this.messageService.showError('No se pudo actualizar el árbol. Recargá la página.'),
      });
  }

  // Lo que la pantalla tenía apuntando a una parte que ya no existe.
  private forget(id: string): void {
    if (this.selectedId() === id) {
      this.selectedId.set(null);
    }

    const editor = this.editor();
    const editing =
      editor?.kind === 'add-child'
        ? editor.parent.id
        : editor?.kind === 'rename'
          ? editor.part.id
          : null;

    if (editing === id) {
      this.editor.set(null);
    }
  }

  private handleWriteError(error: unknown, generic: string): void {
    if (error instanceof MachineNotFoundError) {
      this.messageService.showError('La máquina ya no existe.');
      this.editor.set(null);
      this.loadError.set('not-found');
      return;
    }

    if (
      error instanceof ParentPartNotFoundError ||
      (error instanceof HttpErrorResponse && error.status === 404)
    ) {
      // La parte (o su padre) desapareció mientras se trabajaba: se muestra lo que hay ahora.
      this.messageService.showWarning(
        'La parte ya no existe o cambió. Se actualizó el árbol.',
        'No se pudo guardar',
      );
      this.editor.set(null);
      this.refreshParts();
      return;
    }

    this.messageService.showError(generic);
  }

  private allow(action: string): boolean {
    if (this.canManage()) return true;

    this.messageService.showWarning(`No tiene permiso para ${action}.`, 'Acceso denegado');
    return false;
  }

  private openEditor(editor: Editor, initialName: string): void {
    this.form.reset({ name: initialName });
    this.editor.set(editor);
    // El panel recién existe en el próximo ciclo: el foco pasa al campo para quien usa teclado o
    // lector de pantalla (como el `Modal`).
    setTimeout(() => this.nameInput()?.nativeElement.focus());
  }
}
