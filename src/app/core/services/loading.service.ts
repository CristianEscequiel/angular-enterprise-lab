import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  private activeRequests = 0;

  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  show(): void {
    this.activeRequests++;
    this._isLoading.set(true);
  }

  hide(): void {
    this.activeRequests = Math.max(this.activeRequests - 1, 0);

    if (this.activeRequests === 0) {
      this._isLoading.set(false);
    }
  }
}
