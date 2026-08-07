import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkOrderDetail } from './work-order-detail';

describe('WorkOrderDetail', () => {
  let component: WorkOrderDetail;
  let fixture: ComponentFixture<WorkOrderDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkOrderDetail],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
