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
  size = input<'sm' | 'md' | 'lg' | 'full'>('md');
  disabled = input<boolean>(false);

  classes = computed(() => ({
    'btn--primary': this.variant() === 'primary',
    'btn--secondary': this.variant() === 'secondary',
    'btn--outline': this.variant() === 'outline',
    'btn--danger': this.variant() === 'danger',
    'btn--sm': this.size() === 'sm',
    'btn--md': this.size() === 'md',
    'btn--lg': this.size() === 'lg',
    'btn--full': this.size() === 'full',
  }));

  onClick(): void {
    this.clicked.emit();
  }

}
