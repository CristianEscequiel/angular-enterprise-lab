import { Component, computed, input } from '@angular/core';

type BadgeVariant =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'cancelled';

@Component({
  selector: 'app-badge',
  imports: [],
  templateUrl: './badge.html',
  styleUrl: './badge.scss',
})
export class Badge {
  variant = input<BadgeVariant>('info');
  classes = computed(() => {
    switch (this.variant()) {
      case 'pending':
      case 'warning':
        return 'badge--warning';

      case 'in-progress':
      case 'info':
        return 'badge--info';

      case 'completed':
      case 'success':
        return 'badge--success';

      case 'cancelled':
      case 'error':
        return 'badge--error';

      default:
        return 'badge--neutral';
    }
  });
}
