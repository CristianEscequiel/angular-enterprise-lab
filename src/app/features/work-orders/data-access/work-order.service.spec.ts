import { TestBed } from "@angular/core/testing";
import { WorkOrdersService } from "./work-order.service";

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;

  beforeEach(() => {
    TestBed.configureTestingModule({})
    service = TestBed.inject(WorkOrdersService)

  })

  it('should be created', () => {
    console.log(service)
    expect(service).toBeTruthy();
  })

})
