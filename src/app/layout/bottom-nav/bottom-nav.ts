import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { injectNavItems } from '../nav-items';

// Navegación de mobile (< md), fija al pie para alcanzarla con el pulgar. Desde md la reemplaza el
// sidebar; cuál de las dos se ve lo decide el CSS, no este componente. Los estilos son globales
// (styles/components/_bottom-nav.scss) para no acercarse al presupuesto por componente.
@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.html',
})
export class BottomNav {
  readonly navItems = injectNavItems();
}
