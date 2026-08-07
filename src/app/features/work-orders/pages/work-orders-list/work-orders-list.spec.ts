import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkOrdersList } from './work-orders-list';

describe('WorkOrdersList', () => {
  let component: WorkOrdersList;
  let fixture: ComponentFixture<WorkOrdersList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkOrdersList],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrdersList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
