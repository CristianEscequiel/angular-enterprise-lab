import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, debounceTime, EMPTY, map, Subject, switchMap } from 'rxjs';

import { LocalStorageService } from '../../../../core/services/localStorage.service';
import { MessageService } from '../../../../core/services/message.service';
import { Alert } from '../../../../shared/components/alert/alert';
import { Badge } from '../../../../shared/components/badge/badge';
import { Button } from '../../../../shared/components/button/button';
import { Modal } from '../../../../shared/components/modal/modal';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { WorkOrder } from '../../models/work-order.model';

interface WorkOrdersSearch {
  searchValue: string;
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

  private readonly query = signal<WorkOrdersSearch>({ searchValue: '', page: 1 });
  private readonly requests = new Subject<WorkOrdersSearch>();

  readonly workOrders = signal<WorkOrder[]>([]);
  readonly workOrderDeleted = signal<string>('1');
  readonly error = signal<string | null>(null);
  readonly deleteModalOpen = signal(false);
  readonly currentPage = computed(() => this.query().page);
  readonly totalPages = signal(1);
  readonly pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_, index) => index + 1),
  );
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  readonly isSearchEmpty = computed(() => this.searchText().trim() === '');

  ngOnInit(): void {
    const restored = this.readStoredSearch();
    this.searchControl.setValue(restored.searchValue);

    this.requests
      .pipe(
        switchMap((query) =>
          this.workOrdersService
            .searchByName(query.searchValue, query.page.toString(), this.pageSize.toString())
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
          this.requestWorkOrders({ searchValue, page: 1 });
        }
      });

    this.requestWorkOrders(restored);
  }

  loadWorkOrders(): void {
    const searchValue = this.searchControl.value.trim();
    const page = searchValue === this.query().searchValue ? this.currentPage() : 1;
    this.requestWorkOrders({ searchValue, page });
  }

  goToPage(page: number): void {
    if (!Number.isSafeInteger(page) || page < 1) return;

    const searchValue = this.searchControl.value.trim();
    const targetPage =
      searchValue === this.query().searchValue ? Math.min(page, this.totalPages()) : 1;

    if (searchValue === this.query().searchValue && targetPage === this.currentPage()) return;

    this.requestWorkOrders({ searchValue, page: targetPage });
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
      return { searchValue: stored.searchValue.trim(), page: stored.page };
    }

    return { searchValue: '', page: 1 };
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
