import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkOrderDetail } from './work-order-detail';
import { provideRouter } from '@angular/router';

describe('WorkOrderDetail', () => {
  let component: WorkOrderDetail;
  let fixture: ComponentFixture<WorkOrderDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkOrderDetail],
      providers: [
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrderDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
