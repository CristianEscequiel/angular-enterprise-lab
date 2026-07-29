import { Component, output } from '@angular/core';

@Component({
  selector: 'app-sidebar',
  imports: [],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  closed = output<void>();

  closeSidebar(): void {
    this.closed.emit();
  }
}
