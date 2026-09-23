import {
  isWorkOrderPriority,
  isWorkOrderStatus,
  isWorkOrderType,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from './work-order.model';

describe('work order model guards', () => {
  it('exposes exactly the statuses and priorities stored in db.json', () => {
    expect([...WORK_ORDER_STATUSES]).toEqual(['pending', 'in-progress', 'completed']);
    expect([...WORK_ORDER_PRIORITIES]).toEqual(['low', 'medium', 'high']);
  });

  it.each(['pending', 'in-progress', 'completed'])('isWorkOrderStatus accepts %s', (value) => {
    expect(isWorkOrderStatus(value)).toBe(true);
  });

  it.each(['canceled', 'cancelled', '', 'PENDING', 'in progress', null, undefined, 5, {}])(
    'isWorkOrderStatus rejects %j',
    (value) => {
      expect(isWorkOrderStatus(value)).toBe(false);
    },
  );

  it.each(['low', 'medium', 'high'])('isWorkOrderPriority accepts %s', (value) => {
    expect(isWorkOrderPriority(value)).toBe(true);
  });

  it.each(['urgent', '', 'HIGH', null, undefined, 1, {}])(
    'isWorkOrderPriority rejects %j',
    (value) => {
      expect(isWorkOrderPriority(value)).toBe(false);
    },
  );

  it('exposes exactly the three order types of the maintenance domain', () => {
    expect([...WORK_ORDER_TYPES]).toEqual(['preventivo', 'correctivo', 'pronto-intervencion']);
  });

  it.each(['preventivo', 'correctivo', 'pronto-intervencion'])(
    'isWorkOrderType accepts %s',
    (value) => {
      expect(isWorkOrderType(value)).toBe(true);
    },
  );

  // 'guardia' es un tipo de equipo del técnico, no un tipo de orden: no deben confundirse.
  it.each(['guardia', 'preventivo-correctivo', 'PREVENTIVO', '', null, undefined, 1, {}])(
    'isWorkOrderType rejects %j',
    (value) => {
      expect(isWorkOrderType(value)).toBe(false);
    },
  );
});
