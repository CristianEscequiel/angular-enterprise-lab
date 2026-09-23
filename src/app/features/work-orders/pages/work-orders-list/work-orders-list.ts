import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, debounceTime, EMPTY, finalize, map, merge, Subject, switchMap } from 'rxjs';

import { LocalStorageService } from '@core/services/localStorage.service';
import { MessageService } from '@core/services/message.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Modal } from '@shared/components/modal/modal';
import { WorkOrdersService } from '../../data-access/work-order.service';
import {
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
} from '../../models/work-order.display';
import {
  isWorkOrderPriority,
  isWorkOrderStatus,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
} from '../../models/work-order.model';

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
  private readonly updatingIds = signal<ReadonlySet<string>>(new Set());

  readonly statusOptions = WORK_ORDER_STATUSES;
  readonly priorityOptions = WORK_ORDER_PRIORITIES;
  readonly statusLabels = STATUS_LABELS;
  readonly priorityLabels = PRIORITY_LABELS;
  readonly statusBadge = STATUS_BADGE;
  readonly priorityBadge = PRIORITY_BADGE;

  readonly workOrders = signal<WorkOrder[]>([]);
  readonly workOrderDeleted = signal<string>('');
  readonly error = signal<string | null>(null);
  readonly deleteModalOpen = signal(false);
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
        const totalPages = Math.max(1, response.pages);
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

  changeStatus(order: WorkOrder, select: HTMLSelectElement): void {
    const status = select.value;
    if (!isWorkOrderStatus(status)) {
      select.value = order.status;
      return;
    }
    if (status === order.status || this.isUpdating(order.id)) return;

    this.setUpdating(order.id, true);
    this.workOrdersService
      .updateStatus(order.id, status)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.setUpdating(order.id, false)),
      )
      .subscribe({
        next: (updated) => {
          this.workOrders.update((list) =>
            list.map((item) => (item.id === updated.id ? updated : item)),
          );
          this.messageService.showSuccess('Estado actualizado.');

          const statusFilter = this.query().status;
          if (statusFilter !== '' && updated.status !== statusFilter) {
            this.loadWorkOrders();
          }
        },
        error: () => {
          select.value = order.status;
          this.messageService.showError('No se pudo actualizar el estado.');
        },
      });
  }

  isUpdating(id: string): boolean {
    return this.updatingIds().has(id);
  }

  private setUpdating(id: string, updating: boolean): void {
    this.updatingIds.update((ids) => {
      const next = new Set(ids);
      if (updating) next.add(id);
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
    this.deleteModalOpen.set(true);
    this.workOrderDeleted.set(id);
  }

  deleteWorkOrder(id: string): void {
    this.workOrdersService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messageService.showSuccess('Orden eliminada satisfactoriamente.');
          this.loadWorkOrders();
        },
        error: () => {
          this.messageService.showError('Error al eliminar la orden.');
        },
      });
  }
}
