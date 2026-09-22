import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    <button type="button" (click)="open()">Eliminar</button>
    <app-modal [(isOpen)]="isOpen" message="¿Confirmar?" />
    <button type="button">Elemento externo</button>
  `,
})
class HostComponent {
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }
}

describe('Modal', () => {
  let component: Modal;
  let fixture: ComponentFixture<Modal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Modal],
    }).compileComponents();

    fixture = TestBed.createComponent(Modal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

// Un elemento faltante debe romper el test de forma ruidosa, no silenciosa.
function buttonAt(buttons: HTMLButtonElement[], index: number): HTMLButtonElement {
  const button = buttons[index];
  if (!button) {
    throw new Error(`No se encontró un botón en el índice ${index}`);
  }
  return button;
}

describe('Modal focus management', () => {
  let hostFixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let trigger: HTMLButtonElement;
  let decoy: HTMLButtonElement;

  async function openModal(): Promise<void> {
    trigger.focus();
    trigger.click();
    hostFixture.detectChanges();
    await hostFixture.whenStable();
    // Modal focuses the close button from a real setTimeout; the app is
    // zoneless, so whenStable() does not wait for it — flush one real tick.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  async function closeModal(action: () => void): Promise<void> {
    action();
    hostFixture.detectChanges();
    await hostFixture.whenStable();
  }

  function modalButtons(): HTMLButtonElement[] {
    return Array.from(hostFixture.nativeElement.querySelectorAll('.modal button'));
  }

  function dispatchTab(options: { shiftKey?: boolean } = {}): void {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: options.shiftKey ?? false,
        bubbles: true,
      }),
    );
  }

  function dispatchEscape(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    hostFixture = TestBed.createComponent(HostComponent);
    host = hostFixture.componentInstance;
    hostFixture.detectChanges();
    await hostFixture.whenStable();

    const buttons: HTMLButtonElement[] = Array.from(
      hostFixture.nativeElement.querySelectorAll('button'),
    );
    trigger = buttonAt(buttons, 0);
    decoy = buttonAt(buttons, buttons.length - 1);
  });

  afterEach(() => {
    hostFixture.destroy();
  });

  it('moves focus into the modal when it opens, not to the trigger or body', async () => {
    expect.assertions(2);
    await openModal();

    expect(document.activeElement).not.toBe(trigger);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('cycles focus between the modal own elements and never reaches an element outside it', async () => {
    expect.assertions(4);
    await openModal();

    const buttons = modalButtons();
    const [first, , last] = buttons;

    expect(document.activeElement).toBe(first);

    dispatchTab({ shiftKey: true });
    expect(document.activeElement).toBe(last);

    dispatchTab();
    expect(document.activeElement).toBe(first);
    expect(document.activeElement).not.toBe(decoy);
  });

  it.each([
    ['confirming', () => buttonAt(modalButtons(), 2).click()],
    ['cancelling', () => buttonAt(modalButtons(), 1).click()],
    ['pressing Escape', () => dispatchEscape()],
    [
      'clicking the overlay',
      () => hostFixture.nativeElement.querySelector('.modal-overlay').click(),
    ],
  ])('restores focus to the triggering element after %s', async (_label, action) => {
    expect.assertions(1);
    await openModal();
    await closeModal(action);

    expect(document.activeElement).toBe(trigger);
  });

  it('closes the modal when Escape is pressed', async () => {
    expect.assertions(1);
    await openModal();
    await closeModal(() => dispatchEscape());

    expect(host.isOpen()).toBe(false);
  });
});
