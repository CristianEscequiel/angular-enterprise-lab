import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Toast } from './toast';

describe('Toast', () => {
  let component: Toast;
  let fixture: ComponentFixture<Toast>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Toast],
    }).compileComponents();

    fixture = TestBed.createComponent(Toast);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('title', 'Operación exitosa');
    fixture.componentRef.setInput('message', 'Los datos fueron guardados correctamente');
    fixture.componentRef.setInput('variant', 'success');
    fixture.componentRef.setInput('open', true);

    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
