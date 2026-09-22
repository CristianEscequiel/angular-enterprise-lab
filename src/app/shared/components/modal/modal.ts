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

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Component({
  selector: 'app-modal',
  imports: [],
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
})
export class Modal {
  @ViewChild('modalCloseButton')
  private modalCloseButton?: ElementRef<HTMLButtonElement>;

  @ViewChild('modalRoot')
  private modalRoot?: ElementRef<HTMLElement>;

  readonly isOpen = model(false);

  readonly title = input('Confirmación');
  readonly message = input.required<string>();

  readonly confirmText = input('Confirmar');
  readonly cancelText = input('Cancelar');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly document = inject(DOCUMENT);

  private previousBodyOverflow = '';
  private previouslyFocusedElement: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.openModal();
      } else {
        this.closeModalSideEffects();
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

  @HostListener('document:keydown', ['$event'])
  onTabKey(event: KeyboardEvent): void {
    if (!this.isOpen() || event.key !== 'Tab') return;

    const focusable = this.getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement as HTMLElement | null;
    const activeIndex = active ? focusable.indexOf(active) : -1;

    if (event.shiftKey) {
      if (activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      }
    } else if (activeIndex === -1 || activeIndex === focusable.length - 1) {
      event.preventDefault();
      first.focus();
    }
  }

  private getFocusableElements(): HTMLElement[] {
    return Array.from(
      this.modalRoot?.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    );
  }

  private openModal(): void {
    this.previouslyFocusedElement = this.document.activeElement as HTMLElement | null;

    this.previousBodyOverflow = this.document.body.style.overflow;

    this.document.body.style.overflow = 'hidden';

    this.document.defaultView?.setTimeout(() => {
      this.modalCloseButton?.nativeElement.focus();
    });
  }

  private closeModalSideEffects(): void {
    this.unlockBody();
    this.restoreFocus();
  }

  private unlockBody(): void {
    this.document.body.style.overflow = this.previousBodyOverflow;
  }

  private restoreFocus(): void {
    this.previouslyFocusedElement?.focus();
    this.previouslyFocusedElement = null;
  }
}
