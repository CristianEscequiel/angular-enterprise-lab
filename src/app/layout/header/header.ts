import { Component, output } from '@angular/core';

@Component({
  selector: 'app-header',
  imports: [],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {

  viewSidebar = output<void>();

  onViewClick(): void {
    this.viewSidebar.emit();
  }
}
