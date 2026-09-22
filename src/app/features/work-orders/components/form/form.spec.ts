import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Form } from './form';

describe('Form', () => {
  let component: Form;
  let fixture: ComponentFixture<Form>;

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  function fillValidValues(): void {
    component.workOrderForm.setValue({
      title: 'Revisar motor',
      description: 'Revisar temperatura del motor',
      asset: 'Motor 1',
      priority: 'medium',
    });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Form],
    }).compileComponents();

    fixture = TestBed.createComponent(Form);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('blocks emission and disables the submit button when required fields are empty', () => {
    expect.assertions(2);
    const emit = vi.spyOn(component.sendData, 'emit');

    component.onSubmit();

    expect(emit).not.toHaveBeenCalled();
    expect(submitButton().disabled).toBe(true);
  });

  it('reveals validation error messages after an attempted submit on an untouched form', () => {
    component.onSubmit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Title is required and must be at least 3 characters long.',
    );
  });

  it('emits the raw form value when the form is valid and not submitting', () => {
    expect.assertions(1);
    const emit = vi.spyOn(component.sendData, 'emit');
    fillValidValues();

    component.onSubmit();

    expect(emit).toHaveBeenCalledExactlyOnceWith({
      title: 'Revisar motor',
      description: 'Revisar temperatura del motor',
      asset: 'Motor 1',
      priority: 'medium',
    });
  });

  it('disables the submit button and blocks emission while submitting() is true, even with a valid form', () => {
    expect.assertions(2);
    fillValidValues();
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();
    const emit = vi.spyOn(component.sendData, 'emit');

    expect(submitButton().disabled).toBe(true);

    component.onSubmit();
    expect(emit).not.toHaveBeenCalled();
  });

  it('re-enables the button once submitting() goes back to false', () => {
    fillValidValues();
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();

    fixture.componentRef.setInput('submitting', false);
    fixture.detectChanges();

    expect(submitButton().disabled).toBe(false);
  });
});
