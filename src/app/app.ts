import { Component, inject, signal } from '@angular/core';
import { AppShell } from './layout/app-shell/app-shell';
import { MessageService } from './core/services/message.service';
import { Toast } from "./shared/components/toast/toast";
import { LoadingService } from './core/services/loading.service';
import { Spinner } from './shared/components/spinner/spinner';

@Component({
  selector: 'app-root',
  imports: [AppShell, Toast, Spinner],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('angular-enterprise-lab');
  private readonly messageService = inject(MessageService);
  readonly loadingService = inject(LoadingService);
  message = this.messageService.message;
  closeToast() {
    this.messageService.clear();
  }

}
