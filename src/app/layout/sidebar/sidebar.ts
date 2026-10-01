import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { injectNavItems } from '../nav-items';

// Navegación de escritorio (>= md): siempre visible, sin toggle. En mobile la reemplaza la barra
// inferior; cuál de las dos se ve lo decide el CSS. Las secciones visibles (y los permisos que las
// filtran) viven en nav-items, compartidas con la barra inferior.
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  readonly navItems = injectNavItems();
}
