import { Component, input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-spinner',
  imports: [],
  templateUrl: './spinner.html',
  styleUrl: './spinner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Spinner {
  size = input<'sm' | 'md' | 'lg'>('md');
  label = input('Cargando...');
}
