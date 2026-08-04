import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-button',
  imports: [],
  templateUrl: './button.html',
  styleUrl: './button.scss',
})
export class Button {

  clicked = output<void>();
  variant = input<'primary' | 'secondary' | 'outline' | 'danger'>('primary');

  classes = computed(() => ({
    'btn--primary': this.variant() === 'primary',
    'btn--secondary': this.variant() === 'secondary',
    'btn--outline': this.variant() === 'outline',
    'btn--danger': this.variant() === 'danger',
  }));

  onClick(): void {
    this.clicked.emit();
  }

}
