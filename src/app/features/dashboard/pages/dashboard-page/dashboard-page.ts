import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { WorkOrdersService } from '@features/work-orders/data-access/work-order.service';
import { WorkOrder } from '@features/work-orders/models/work-order.model';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { buildShiftBoard } from '../../models/shift-board';

// Cuántas órdenes se listan bajo cada columna del tablero (desde md; en mobile solo se ven las cifras).
export const BOARD_COLUMN_LIMIT = 3;

@Component({
  selector: 'app-dashboard-page',
  imports: [Alert, Button, RouterLink],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage implements OnInit {
  private readonly workOrders = inject(WorkOrdersService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly columnLimit = BOARD_COLUMN_LIMIT;

  private readonly orders = signal<WorkOrder[]>([]);
  // "Hoy" se fija al cargar, no en cada evaluación: el tablero es una foto coherente del momento en
  // que se pidió, y los `computed` quedan puros.
  private readonly loadedAt = signal(new Date());

  readonly loading = signal(true);
  readonly error = signal(false);

  readonly board = computed(() =>
    buildShiftBoard(this.orders(), this.authService.currentUser()?.id ?? null, this.loadedAt()),
  );

  ngOnInit(): void {
    this.load();
  }

  // También es lo que repite "Reintentar" tras un error.
  load(): void {
    this.loading.set(true);
    this.error.set(false);

    this.workOrders
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          this.orders.set(orders);
          this.loadedAt.set(new Date());
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }
}
