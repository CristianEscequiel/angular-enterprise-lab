import { Component, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { injectNavItems } from '../nav-items';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  closed = output<void>();

  // Las secciones visibles (y los permisos que las filtran) viven en nav-items, compartidas con la
  // barra inferior.
  readonly navItems = injectNavItems();

  closeSidebar(): void {
    this.closed.emit();
  }
}
