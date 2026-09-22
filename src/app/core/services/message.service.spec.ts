import { TestBed } from '@angular/core/testing';
import { MessageService } from './message.service';

describe('MessageService', () => {
  let service: MessageService;

  beforeEach(() => {
    service = TestBed.inject(MessageService);
  });

  it('showError sets an error message with a default title', () => {
    service.showError('Algo salió mal');
    expect(service.message()).toEqual({
      variant: 'error',
      title: 'Error',
      message: 'Algo salió mal',
    });
  });

  it('showSuccess sets a success message with a default title', () => {
    service.showSuccess('Orden creada');
    expect(service.message()).toEqual({
      variant: 'success',
      title: 'Operación exitosa',
      message: 'Orden creada',
    });
  });

  it('showWarning sets a warning message with a default title', () => {
    service.showWarning('No hubo cambios en la orden');
    expect(service.message()).toEqual({
      variant: 'warning',
      title: 'Precaucion',
      message: 'No hubo cambios en la orden',
    });
  });

  it('clear removes the current message', () => {
    service.showError('Algo salió mal');
    expect(service.message()).not.toBeNull();

    service.clear();

    expect(service.message()).toBeNull();
  });
});
