import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkOrderCreate } from './work-order-create';

describe('WorkOrderCreate', () => {
  let component: WorkOrderCreate;
  let fixture: ComponentFixture<WorkOrderCreate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkOrderCreate],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderCreate);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
