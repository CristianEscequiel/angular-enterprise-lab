import {
  CLOSING_NOTE_MAX_LENGTH,
  CLOSING_NOTE_MIN_LENGTH,
  isClosedStatus,
  isValidClosingComment,
  isWorkOrderClosingNote,
  isWorkOrderMachineRef,
  isWorkOrderTaker,
  isWorkOrderPriority,
  isWorkOrderStatus,
  isWorkOrderType,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from './work-order.model';

describe('work order model guards', () => {
  it('exposes exactly the statuses and priorities stored in db.json', () => {
    expect([...WORK_ORDER_STATUSES]).toEqual(['pending', 'in-progress', 'completed', 'cancelled']);
    expect([...WORK_ORDER_PRIORITIES]).toEqual(['low', 'medium', 'high']);
  });

  it.each(['pending', 'in-progress', 'completed', 'cancelled'])(
    'isWorkOrderStatus accepts %s',
    (value) => {
      expect(isWorkOrderStatus(value)).toBe(true);
    },
  );

  it.each(['canceled', 'CANCELLED', '', 'PENDING', 'in progress', null, undefined, 5, {}])(
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

describe('isWorkOrderMachineRef', () => {
  const valid = {
    machineId: '1',
    partId: '3',
    breadcrumb: 'Envasadora línea 1 > Mesa de transporte > Cinta 1 > Motor de cinta',
    comment: 'Vibración en el arranque',
  };

  it('accepts a reference to a part', () => {
    expect(isWorkOrderMachineRef(valid)).toBe(true);
  });

  it('accepts a machine-level reference (partId null) and an empty comment', () => {
    expect(
      isWorkOrderMachineRef({
        ...valid,
        partId: null,
        breadcrumb: 'Envasadora línea 1',
        comment: '',
      }),
    ).toBe(true);
  });

  it.each(['machineId', 'partId', 'breadcrumb', 'comment'])(
    'rejects a reference without %s',
    (field) => {
      const incomplete = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));

      expect(isWorkOrderMachineRef(incomplete)).toBe(false);
    },
  );

  it.each([
    ['machineId', ''],
    ['machineId', '   '],
    ['machineId', 1],
    ['partId', ''],
    ['partId', 3],
    ['breadcrumb', ''],
    ['breadcrumb', null],
    ['comment', null],
    ['comment', 5],
  ])('rejects %s = %j', (field, value) => {
    expect(isWorkOrderMachineRef({ ...valid, [field]: value })).toBe(false);
  });

  it.each([null, undefined, 'Motor 1', 5, []])('rejects %j', (value) => {
    expect(isWorkOrderMachineRef(value)).toBe(false);
  });
});

describe('closing note (spec 013d)', () => {
  describe('isClosedStatus', () => {
    it.each(['completed', 'cancelled'])('is true for %s', (status) => {
      expect(isClosedStatus(status)).toBe(true);
    });

    it.each(['pending', 'in-progress', '', 'CANCELLED', null, undefined, 3])(
      'is false for %j',
      (status) => {
        expect(isClosedStatus(status)).toBe(false);
      },
    );
  });

  describe('isValidClosingComment', () => {
    const text = (length: number) => 'x'.repeat(length);

    it('exposes the limits of the rule: 50 to 500 characters', () => {
      expect(CLOSING_NOTE_MIN_LENGTH).toBe(50);
      expect(CLOSING_NOTE_MAX_LENGTH).toBe(500);
    });

    it.each([
      [49, false],
      [50, true],
      [51, true],
      [500, true],
      [501, false],
      [0, false],
    ])('a comment of %i characters is valid: %s', (length, valid) => {
      expect(isValidClosingComment(text(length))).toBe(valid);
    });

    it('does not count the spaces at the borders', () => {
      expect(isValidClosingComment(' '.repeat(60) + text(10))).toBe(false);
      expect(isValidClosingComment(' ' + text(50) + '  ')).toBe(true);
      expect(isValidClosingComment(text(49) + ' '.repeat(20))).toBe(false);
    });

    it('rejects a comment of only whitespace', () => {
      expect(isValidClosingComment(' '.repeat(80))).toBe(false);
      expect(isValidClosingComment('\n\t '.repeat(30))).toBe(false);
    });

    it.each([null, undefined, 5, {}, []])('rejects %j', (value) => {
      expect(isValidClosingComment(value)).toBe(false);
    });
  });

  describe('isWorkOrderClosingNote', () => {
    const valid = {
      comment: 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.',
      authorId: '5',
      authorName: 'Técnico Electricista Preventivo',
      at: '2026-09-25T15:00:00.000Z',
    };

    it('accepts a complete note', () => {
      expect(isWorkOrderClosingNote(valid)).toBe(true);
    });

    it.each(['comment', 'authorId', 'authorName', 'at'])('rejects a note without %s', (field) => {
      const incomplete = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));

      expect(isWorkOrderClosingNote(incomplete)).toBe(false);
    });

    it.each([
      ['comment', 'x'.repeat(49)],
      ['comment', ' '.repeat(80)],
      ['authorId', ''],
      ['authorName', '   '],
      ['at', ''],
    ])('rejects %s = %j', (field, value) => {
      expect(isWorkOrderClosingNote({ ...valid, [field]: value })).toBe(false);
    });

    it.each([null, undefined, 'nota', 5])('rejects %j', (value) => {
      expect(isWorkOrderClosingNote(value)).toBe(false);
    });
  });

  describe('isWorkOrderTaker', () => {
    const valid = { id: '2', name: 'Técnico Mecánico de Guardia', at: '2026-09-25T10:00:00.000Z' };

    it('accepts a complete taker', () => {
      expect(isWorkOrderTaker(valid)).toBe(true);
    });

    it.each(['id', 'name', 'at'])('rejects a taker without %s', (field) => {
      const incomplete = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));

      expect(isWorkOrderTaker(incomplete)).toBe(false);
    });

    it.each([null, undefined, 'x', 3])('rejects %j', (value) => {
      expect(isWorkOrderTaker(value)).toBe(false);
    });
  });
});
