import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, debounceTime, EMPTY, finalize, map, merge, Subject, switchMap } from 'rxjs';

import { errorStatus } from '@core/api/api-error';
import { AuthService } from '@core/auth/auth.service';
import { LocalStorageService } from '@core/services/localStorage.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Modal } from '@shared/components/modal/modal';
import {
  WorkOrderLoadError,
  WorkOrdersService,
  WorkOrderStateError,
} from '../../data-access/work-order.service';
import {
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  TYPE_LABELS,
} from '../../models/work-order.display';
import {
  isClosedStatus,
  isWorkOrderPriority,
  isWorkOrderStatus,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderTaker,
} from '../../models/work-order.model';
import {
  canDeleteWorkOrder,
  canEditWorkOrder,
  canReleaseWorkOrder,
  canResolveWorkOrder,
  canTakeWorkOrder,
  creatableTypes,
} from '../../models/work-order.permissions';

interface WorkOrdersSearch {
  searchValue: string;
  status: WorkOrderStatus | '';
  priority: WorkOrderPriority | '';
  page: number;
}

@Component({
  selector: 'app-work-orders-list',
  imports: [Alert, Button, Badge, Modal, ReactiveFormsModule],
  templateUrl: './work-orders-list.html',
  styleUrl: './work-orders-list.scss',
})
export class WorkOrdersList implements OnInit {
  private readonly router = inject(Router);
  private readonly workOrdersService = inject(WorkOrdersService);
  private readonly messageService = inject(MessageService);
  private readonly authService = inject(AuthService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageSize = 10;
  private readonly localStorageKey = 'workOrdersSearch';

  private readonly query = signal<WorkOrdersSearch>({
    searchValue: '',
    status: '',
    priority: '',
    page: 1,
  });
  private readonly requests = new Subject<WorkOrdersSearch>();
  // Órdenes con una operación en curso (tomar, liberar): evita el doble clic.
  private readonly busyIds = signal<ReadonlySet<string>>(new Set());

  readonly statusOptions = WORK_ORDER_STATUSES;
  readonly priorityOptions = WORK_ORDER_PRIORITIES;
  readonly statusLabels = STATUS_LABELS;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly statusBadge = STATUS_BADGE;
  readonly priorityBadge = PRIORITY_BADGE;
  readonly typeLabels = TYPE_LABELS;

  // Permisos que la política resuelve por rol: la plantilla oculta las acciones y los métodos de
  // abajo vuelven a comprobarlos, para no depender de lo que muestre la UI.
  readonly canCreate = computed(() => creatableTypes(this.authService.currentUser()).length > 0);
  readonly canEdit = computed(() => canEditWorkOrder(this.authService.currentUser()));
  readonly canDelete = computed(() => canDeleteWorkOrder(this.authService.currentUser()));

  readonly workOrders = signal<WorkOrder[]>([]);
  readonly workOrderDeleted = signal<string>('');
  readonly error = signal<string | null>(null);
  readonly deleteModalOpen = signal(false);
  readonly releaseModalOpen = signal(false);
  readonly workOrderToRelease = signal<WorkOrder | null>(null);
  readonly releaseMessage = computed(() => {
    const order = this.workOrderToRelease();
    const owner = order?.takenBy ? ` y ${order.takenBy.name} deja de ser quien la ejecuta` : '';

    return `La orden${order ? ` "${order.title}"` : ''} vuelve a pendiente${owner}. Cualquier técnico habilitado podrá tomarla.`;
  });
  readonly currentPage = computed(() => this.query().page);
  readonly totalPages = signal(1);
  readonly pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, index) => index + 1),
  );
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusFilter = new FormControl<WorkOrderStatus | ''>('', { nonNullable: true });
  readonly priorityFilter = new FormControl<WorkOrderPriority | ''>('', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  readonly isSearchEmpty = computed(() => this.searchText().trim() === '');
  readonly hasActiveCriteria = computed(() => {
    const { searchValue, status, priority } = this.query();
    return searchValue !== '' || status !== '' || priority !== '';
  });

  // Región live siempre presente en el DOM (no dentro de @if/@else) para que
  // el anuncio sea confiable: una región que nace junto con su contenido no
  // se anuncia de forma fiable en lectores de pantalla.
  readonly resultsAnnouncement = computed(() => {
    if (this.error()) return '';
    const count = this.workOrders().length;
    if (count === 0) return 'No se encontraron órdenes de trabajo.';
    return count === 1 ? '1 orden encontrada.' : `${count} órdenes encontradas.`;
  });

  ngOnInit(): void {
    const restored = this.readStoredSearch();
    this.searchControl.setValue(restored.searchValue);
    this.statusFilter.setValue(restored.status);
    this.priorityFilter.setValue(restored.priority);

    this.requests
      .pipe(
        switchMap((query) =>
          this.workOrdersService
            .search({
              title: query.searchValue,
              status: query.status,
              priority: query.priority,
              page: query.page,
              perPage: this.pageSize,
            })
            .pipe(
              map((response) => ({ query, response })),
              catchError(() => {
                this.error.set('No se pudieron cargar las órdenes. Intentá nuevamente.');
                return EMPTY;
              }),
            ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ query, response }) => {
        const totalPages = Math.max(1, response.totalPages);
        this.totalPages.set(totalPages);
        if (query.page > totalPages) {
          this.requestWorkOrders({ ...query, page: totalPages });
          return;
        }
        this.workOrders.set(response.data);
      });

    this.searchControl.valueChanges
      .pipe(
        map((value) => value.trim()),
        debounceTime(300),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((searchValue) => {
        if (searchValue !== this.query().searchValue) {
          this.requestWorkOrders({ ...this.criteriaFromControls(1), searchValue });
        }
      });

    merge(this.statusFilter.valueChanges, this.priorityFilter.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.requestWorkOrders(this.criteriaFromControls(1)));

    this.requestWorkOrders(restored);
  }

  loadWorkOrders(): void {
    const criteria = this.criteriaFromControls(this.currentPage());
    this.requestWorkOrders(this.sameCriteria(criteria) ? criteria : { ...criteria, page: 1 });
  }

  goToPage(page: number): void {
    if (!Number.isSafeInteger(page) || page < 1) return;

    const criteria = this.criteriaFromControls(page);
    const same = this.sameCriteria(criteria);
    const targetPage = same ? Math.min(page, this.totalPages()) : 1;

    if (same && targetPage === this.currentPage()) return;

    this.requestWorkOrders({ ...criteria, page: targetPage });
  }

  // El estado ya no se cambia a mano desde el listado (spec 013d): pasa a `in-progress` al tomar la
  // orden, se cierra desde su página y vuelve a `pending` al liberarla. Estas tres funciones son la
  // política de la pantalla; la plantilla oculta los botones y cada método vuelve a comprobarla.
  canContinue(order: WorkOrder): boolean {
    return canResolveWorkOrder(this.authService.currentUser(), order);
  }

  // "Tomar orden" se ofrece al técnico que la atiende también sobre una orden que ejecuta OTRO: al
  // pulsarlo se le advierte quién la tiene (no se le quita).
  canTake(order: WorkOrder): boolean {
    return (
      canTakeWorkOrder(this.authService.currentUser(), order) &&
      !isClosedStatus(order.status) &&
      !this.canContinue(order)
    );
  }

  canRelease(order: WorkOrder): boolean {
    return canReleaseWorkOrder(this.authService.currentUser(), order);
  }

  isBusy(id: string): boolean {
    return this.busyIds().has(id);
  }

  // Tomar una orden pendiente o continuar la propia. Navega a la página de cierre SOLO si tomarla
  // salió bien: nunca se abre esa página para una orden que no es del técnico.
  takeWorkOrder(order: WorkOrder): void {
    const user = this.authService.currentUser();

    if (user === null || !canTakeWorkOrder(user, order)) {
      this.messageService.showWarning(
        'No tiene permiso para tomar órdenes de ese tipo.',
        'Acceso denegado',
      );
      return;
    }

    if (this.isBusy(order.id)) return;

    if (canResolveWorkOrder(user, order)) {
      this.navigateToResolve(order.id);
      return;
    }

    // La orden que se ve ya no está pendiente: se advierte sin tocar el servidor.
    if (order.status !== 'pending') {
      this.messageService.showWarning(
        new WorkOrderStateError('not-pending', order.takenBy ?? null, order.status).message,
        'Orden en ejecución',
      );
      return;
    }

    const taker: WorkOrderTaker = {
      id: user.id,
      name: user.displayName,
      at: new Date().toISOString(),
    };

    this.setBusy(order.id, true);
    this.workOrdersService
      .take(order.id, taker)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setBusy(order.id, false)),
      )
      .subscribe({
        next: () => this.navigateToResolve(order.id),
        error: (error: unknown) => this.handleTakeError(error, user.id, order.id),
      });
  }

  openReleaseModal(order: WorkOrder): void {
    if (!this.canRelease(order)) {
      this.warnReleaseDenied();
      return;
    }
    this.workOrderToRelease.set(order);
    this.releaseModalOpen.set(true);
  }

  confirmRelease(): void {
    const order = this.workOrderToRelease();

    if (!order) return;

    if (!this.canRelease(order)) {
      this.warnReleaseDenied();
      return;
    }

    if (this.isBusy(order.id)) return;

    this.setBusy(order.id, true);
    this.workOrdersService
      .release(order.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setBusy(order.id, false)),
      )
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Orden liberada: vuelve a estar pendiente.');
          this.loadWorkOrders();
        },
        error: (error: unknown) => {
          if (error instanceof WorkOrderStateError) {
            // La lista estaba desactualizada (ya la cerraron o la liberaron): se recarga.
            this.messageService.showWarning(error.message, 'No se puede liberar');
            this.loadWorkOrders();
            return;
          }

          this.messageService.showError('No se pudo liberar la orden.');
        },
      });
  }

  private handleTakeError(error: unknown, userId: string, orderId: string): void {
    if (error instanceof WorkOrderStateError) {
      // La lista estaba vieja pero la orden ya era de este técnico: se sigue con ella.
      if (error.status === 'in-progress' && error.takenBy?.id === userId) {
        this.navigateToResolve(orderId);
        return;
      }

      this.messageService.showWarning(error.message, 'Orden en ejecución');
      this.loadWorkOrders();
      return;
    }

    this.messageService.showError('No se pudo tomar la orden.');
  }

  private navigateToResolve(id: string): void {
    this.router.navigate(['/work-orders', id, 'resolve']);
  }

  private warnReleaseDenied(): void {
    this.messageService.showWarning('No tiene permiso para liberar órdenes.', 'Acceso denegado');
  }

  private setBusy(id: string, busy: boolean): void {
    this.busyIds.update((ids) => {
      const next = new Set(ids);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private criteriaFromControls(page: number): WorkOrdersSearch {
    return {
      searchValue: this.searchControl.value.trim(),
      status: this.statusFilter.value,
      priority: this.priorityFilter.value,
      page,
    };
  }

  private sameCriteria(criteria: WorkOrdersSearch): boolean {
    const applied = this.query();
    return (
      criteria.searchValue === applied.searchValue &&
      criteria.status === applied.status &&
      criteria.priority === applied.priority
    );
  }

  private requestWorkOrders(query: WorkOrdersSearch): void {
    this.query.set(query);
    this.error.set(null);
    this.localStorageService.set(this.localStorageKey, query);
    this.requests.next(query);
  }

  private readStoredSearch(): WorkOrdersSearch {
    const stored = this.localStorageService.get(this.localStorageKey);

    if (
      typeof stored === 'object' &&
      stored !== null &&
      'searchValue' in stored &&
      typeof stored.searchValue === 'string' &&
      'page' in stored &&
      typeof stored.page === 'number' &&
      Number.isSafeInteger(stored.page) &&
      stored.page >= 1
    ) {
      return {
        searchValue: stored.searchValue.trim(),
        status: 'status' in stored && isWorkOrderStatus(stored.status) ? stored.status : '',
        priority:
          'priority' in stored && isWorkOrderPriority(stored.priority) ? stored.priority : '',
        page: stored.page,
      };
    }

    return { searchValue: '', status: '', priority: '', page: 1 };
  }

  viewWorkOrder(id: string): void {
    this.router.navigate(['/work-orders', id]);
  }

  editWorkOrder(id: string): void {
    this.router.navigate(['/work-orders', id, 'edit']);
  }

  navigateToCreateWorkOrder(): void {
    this.router.navigate(['/work-orders/new']);
  }

  openDeleteModal(id: string): void {
    if (!this.canDelete()) {
      this.warnDeleteDenied();
      return;
    }
    this.deleteModalOpen.set(true);
    this.workOrderDeleted.set(id);
  }

  deleteWorkOrder(id: string): void {
    if (!this.canDelete()) {
      this.warnDeleteDenied();
      return;
    }

    this.workOrdersService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Orden eliminada satisfactoriamente.');
          this.loadWorkOrders();
        },
        error: (error: unknown) => {
          // Ya no existe (la borró otro usuario): la lista estaba desactualizada y se recarga. Un
          // `403` ya lo avisó el interceptor.
          if (error instanceof WorkOrderLoadError) {
            this.messageService.showWarning('La orden ya no existe.', 'No se pudo eliminar');
            this.loadWorkOrders();
            return;
          }

          if (errorStatus(error) === 403) return;

          this.messageService.showError('Error al eliminar la orden.');
        },
      });
  }

  private warnDeleteDenied(): void {
    this.messageService.showWarning('No tiene permiso para eliminar órdenes.', 'Acceso denegado');
  }
}
