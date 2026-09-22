import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { WorkOrderLoader } from '../../data-access/work-order-loader';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';

@Component({
  selector: 'app-work-order-detail',
  imports: [Alert, Button],
  templateUrl: './work-order-detail.html',
  styleUrl: './work-order-detail.scss',
  providers: [WorkOrderLoader],
})
export class WorkOrderDetail implements OnInit {
  private readonly loader = inject(WorkOrderLoader);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly workOrderDetail = this.loader.workOrder;
  readonly loadError = this.loader.error;

  ngOnInit() {
    const id = this.activatedRoute.snapshot.paramMap.get('id');
    if (!id) {
      this.loader.error.set('not-found');
      return;
    }
    this.loader.load(id);
  }

  retry(): void {
    this.loader.retry();
  }

  navigateToWorkOrdersList(): void {
    this.router.navigate(['/work-orders']);
  }
}
