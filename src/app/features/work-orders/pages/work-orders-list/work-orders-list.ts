import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';

import { WorkOrder } from '../../models/work-order.model';
import { WorkOrdersService } from '../../data-access/work-order.service';
import { Alert } from '../../../../shared/components/alert/alert';
import { Button } from '../../../../shared/components/button/button';
import { Router } from '@angular/router';
import { Badge } from '../../../../shared/components/badge/badge';
import { MessageService } from '../../../../core/services/message.service';
import { Modal } from '../../../../shared/components/modal/modal';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-work-orders-list',
  imports: [Alert, Button, Badge, Modal, ReactiveFormsModule],
  templateUrl: './work-orders-list.html',
  styleUrl: './work-orders-list.scss',
})
export class WorkOrdersList implements OnInit {
  private readonly route = inject(Router);
  private readonly workOrdersService = inject(WorkOrdersService);
  private readonly messageService = inject(MessageService)
  readonly workOrders = signal<WorkOrder[]>([]);
  readonly workOrderDeleted = signal<string>('1');
  readonly error = signal<string | null>(null);
  readonly isModalOpen = signal<boolean>(false)
  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly pages = computed(() =>
    Array.from(
      { length: this.totalPages() },
      (_, index) => index + 1
    )
  );
  private readonly destroyRef = inject(DestroyRef)
  readonly searchControl = new FormControl('', { nonNullable: true });
  ngOnInit() {
    this.loadWorkOrders();
  }

  loadWorkOrders(): void {
    this.error.set(null);
    this.workOrdersService.getPaginated(1, 10).subscribe({
      next: (workOrders) => {
        this.totalPages.set(workOrders.pages);
        this.currentPage.set(workOrders.first);
        this.workOrders.set(workOrders.data);
      },
      error: (error) => { this.error.set('Error loading paginated work orders: ' + error.message); }
    });
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(value =>
          this.workOrdersService.searchByName(value.trim())
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(workOrders => {
        this.totalPages.set(workOrders.pages);
        this.currentPage.set(workOrders.first);
        this.workOrders.set(workOrders.data);
      });
  }
  goToPage(page: number): void {
    this.currentPage.set(page);
    this.workOrdersService.getPaginated(page, 10).subscribe({
      next: (workOrders) => {
        this.workOrders.set(workOrders.data);
      },
      error: (error) => {
        console.error('Error loading paginated work orders:', error);
      },
    });
  }
  viewWorkOrder(id: string): void {
    this.route.navigate(['/work-orders', id]);
  }
  editWorkOrder(id: string): void {
    console.log('Navigating to edit work order with ID:', id);
    this.route.navigate(['/work-orders', id, 'edit'], {
      state: { id }
    });
  }
  navigateToCreateWorkOrder(): void {
    this.route.navigate(['/work-orders/new']);
  }
  readonly deleteModalOpen = signal(false);

  openDeleteModal(id: string): void {
    this.deleteModalOpen.set(true);
    this.workOrderDeleted.set(id)
  }

  deleteWorkOrder(id: string): void {
    this.workOrdersService.delete(id).subscribe({
      next: () => {
        this.messageService.showSuccess('Orden eliminada satisfactoriamente.');
        this.loadWorkOrders();
        console.log('Work order deleted successfully.');
      },
      error: (error) => {
        this.messageService.showError('Error al eliminar la orden!')
        console.error('Error deleting work order:', error);
      },
    });
  }
}
