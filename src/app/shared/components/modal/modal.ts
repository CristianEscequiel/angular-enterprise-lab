import {
  Component,
  DOCUMENT,
  ElementRef,
  HostListener,
  ViewChild,
  effect,
  inject,
  input,
  model,
  output,
} from '@angular/core';

@Component({
  selector: 'app-modal',
  imports: [],
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
})
export class Modal {
  @ViewChild('modalCloseButton')
  private modalCloseButton?: ElementRef<HTMLButtonElement>;

  readonly isOpen = model(false);

  readonly title = input('Confirmación');
  readonly message = input.required<string>();

  readonly confirmText = input('Confirmar');
  readonly cancelText = input('Cancelar');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly document = inject(DOCUMENT);

  private previousBodyOverflow = '';

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.openModal();
      } else {
        this.unlockBody();
      }
    });
  }

  confirm(): void {
    this.confirmed.emit();
    this.closeModal();
  }

  cancel(): void {
    this.cancelled.emit();
    this.closeModal();
  }

  closeModal(): void {
    this.isOpen.set(false);
  }

  onModalOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isOpen()) {
      this.cancel();
    }
  }

  private openModal(): void {
    this.previousBodyOverflow = this.document.body.style.overflow;

    this.document.body.style.overflow = 'hidden';

    this.document.defaultView?.setTimeout(() => {
      this.modalCloseButton?.nativeElement.focus();
    });
  }

  private unlockBody(): void {
    this.document.body.style.overflow = this.previousBodyOverflow;
  }
}
