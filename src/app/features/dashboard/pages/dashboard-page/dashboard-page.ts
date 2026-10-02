import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { WorkOrdersService } from '@features/work-orders/data-access/work-order.service';
import {
  PaginatedResponse,
  WorkOrder,
  WorkOrderStatus,
} from '@features/work-orders/models/work-order.model';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { DashboardService } from '../../data-access/dashboard.service';
import { DashboardSummary, formatDuration, WorkloadItem } from '../../models/dashboard.model';
import { canViewWorkload } from '../../models/dashboard.permissions';
import { buildShiftBoard } from '../../models/shift-board';

// Cuántas órdenes se listan bajo cada columna del tablero (desde md; en mobile solo se ven las cifras).
export const BOARD_COLUMN_LIMIT = 3;

// Las listas del tablero son la primera página de cada estado. Si un estado tiene más órdenes que las
// que llegaron, la columna lo dice (`shown` de `total`) en vez de pasar por completa.
interface Truncation {
  shown: number;
  total: number;
}

type ListsByStatus = Record<WorkOrderStatus, PaginatedResponse<WorkOrder>>;

@Component({
  selector: 'app-dashboard-page',
  imports: [Alert, Button, RouterLink],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage implements OnInit {
  private readonly workOrders = inject(WorkOrdersService);
  private readonly dashboard = inject(DashboardService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly columnLimit = BOARD_COLUMN_LIMIT;
  readonly formatDuration = formatDuration;

  private readonly orders = signal<WorkOrder[]>([]);
  // "Hoy" se fija al cargar, no en cada evaluación: el tablero es una foto coherente del momento en
  // que se pidió, y los `computed` quedan puros.
  private readonly loadedAt = signal(new Date());
  private readonly lists = signal<ListsByStatus | null>(null);

  readonly loading = signal(true);
  readonly error = signal(false);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly workload = signal<WorkloadItem[]>([]);

  // La carga de trabajo solo se pide y se muestra a quien la puede ver (administrador y team leader).
  readonly showWorkload = computed(() => canViewWorkload(this.authService.currentUser()));

  readonly board = computed(() =>
    buildShiftBoard(this.orders(), this.authService.currentUser()?.id ?? null, this.loadedAt()),
  );

  readonly pendingTruncation = computed(() => this.truncation(['pending']));
  readonly inProgressTruncation = computed(() => this.truncation(['in-progress']));
  readonly closedTruncation = computed(() => this.truncation(['completed', 'cancelled']));

  ngOnInit(): void {
    this.load();
  }

  // También es lo que repite "Reintentar" tras un error. Todas las lecturas van juntas: si una falla,
  // el tablero no se muestra a medias.
  load(): void {
    this.loading.set(true);
    this.error.set(false);

    const workload$: Observable<WorkloadItem[]> = this.showWorkload()
      ? this.dashboard.getWorkload()
      : of([]);

    forkJoin({
      summary: this.dashboard.getSummary(),
      pending: this.workOrders.listByStatus('pending'),
      inProgress: this.workOrders.listByStatus('in-progress'),
      completed: this.workOrders.listByStatus('completed'),
      cancelled: this.workOrders.listByStatus('cancelled'),
      workload: workload$,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ summary, pending, inProgress, completed, cancelled, workload }) => {
          this.lists.set({
            pending,
            'in-progress': inProgress,
            completed,
            cancelled,
          });
          this.orders.set([
            ...pending.data,
            ...inProgress.data,
            ...completed.data,
            ...cancelled.data,
          ]);
          this.summary.set(summary);
          this.workload.set(workload);
          this.loadedAt.set(new Date());
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  private truncation(statuses: readonly WorkOrderStatus[]): Truncation | null {
    const lists = this.lists();

    if (!lists) {
      return null;
    }

    const shown = statuses.reduce((sum, status) => sum + lists[status].data.length, 0);
    const total = statuses.reduce((sum, status) => sum + lists[status].totalItems, 0);

    return total > shown ? { shown, total } : null;
  }
}
