import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Alert } from './alert';

describe('Alert', () => {
  let component: Alert;
  let fixture: ComponentFixture<Alert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Alert],
    }).compileComponents();

    fixture = TestBed.createComponent(Alert);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('title', 'Operación exitosa');
    fixture.componentRef.setInput('message', 'Los datos fueron guardados correctamente');
    fixture.componentRef.setInput('variant', 'success');

    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
