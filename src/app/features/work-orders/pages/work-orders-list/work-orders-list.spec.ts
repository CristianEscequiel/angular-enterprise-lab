import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkOrdersList } from './work-orders-list';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

describe('WorkOrdersList', () => {
  let component: WorkOrdersList;
  let fixture: ComponentFixture<WorkOrdersList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkOrdersList],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                id: '1',
              }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkOrdersList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
