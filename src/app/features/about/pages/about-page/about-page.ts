import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { ABOUT_CONTENT } from '../../models/about-content';

@Component({
  selector: 'app-about-page',
  imports: [RouterLink],
  templateUrl: './about-page.html',
  styleUrl: './about-page.scss',
})
export class AboutPage {
  private readonly authService = inject(AuthService);

  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly content = ABOUT_CONTENT;
}
