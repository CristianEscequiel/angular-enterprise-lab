import { Injectable, signal } from '@angular/core';

export type MessageVariant = 'success' | 'error' | 'warning' | 'info';

export interface AppMessage {
  variant: MessageVariant;
  title: string;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private readonly _message = signal<AppMessage | null>(null);
  readonly message = this._message.asReadonly();

  showError(message: string, title = 'Error'): void {
    this._message.set({
      variant: 'error',
      title,
      message,
    });
  }

  showSuccess(message: string, title = 'Operación exitosa'): void {
    this._message.set({
      variant: 'success',
      title,
      message,
    });
  }
  showWarning(message: string, title = 'Precaucion'): void {
    this._message.set({
      variant: 'warning',
      title,
      message,
    });
  }

  clear(): void {
    this._message.set(null);
  }
}
