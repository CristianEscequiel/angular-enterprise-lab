import {
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@features/work-orders/models/work-order.model';
import { MACHINE_REF_FIXTURE } from '@features/work-orders/testing/work-order.fixtures';
import { buildShiftBoard } from './shift-board';

describe('buildShiftBoard', () => {
  // Hoy, en hora local: los tests no dependen de la zona horaria de la máquina.
  const now = new Date(2026, 8, 30, 15, 0);
  const at = (day: number, hour = 12): string => new Date(2026, 8, day, hour, 0).toISOString();

  const ME = '2';
  const SOMEONE_ELSE = '7';

  function order(id: string, over: Partial<WorkOrder> = {}): WorkOrder {
    return {
      id,
      title: `Orden ${id}`,
      description: 'Descripción de la orden',
      machineRef: MACHINE_REF_FIXTURE,
      type: 'correctivo',
      priority: 'medium',
      status: 'pending',
      createdAt: at(20),
      ...over,
    };
  }

  const taken = (userId: string, day = 25) => ({
    id: userId,
    name: `Técnico ${userId}`,
    at: at(day),
  });
  const closing = (userId: string, closedAt: string) => ({
    comment: 'Se reemplazó el rodamiento delantero y se verificó el giro sin vibración.',
    authorId: userId,
    authorName: `Técnico ${userId}`,
    at: closedAt,
  });
  const ids = (list: WorkOrder[]): string[] => list.map((item) => item.id);

  describe('pending', () => {
    it('counts only the orders still without an owner', () => {
      const board = buildShiftBoard(
        [
          order('1'),
          order('2', { status: 'in-progress', takenBy: taken(ME) }),
          order('3', { status: 'completed', takenBy: taken(ME), closingNote: closing(ME, at(30)) }),
          order('4', { takenBy: null }),
        ],
        ME,
        now,
      );

      expect(ids(board.pending).sort()).toEqual(['1', '4']);
    });

    it.each<[string, WorkOrderPriority[], number]>([
      ['none of them high', ['low', 'medium'], 0],
      ['some of them high', ['high', 'low', 'high'], 2],
      ['all of them high', ['high', 'high'], 2],
    ])('reports how many are high priority when %s', (_label, priorities, expected) => {
      const board = buildShiftBoard(
        priorities.map((priority, index) => order(String(index), { priority })),
        ME,
        now,
      );

      expect(board.pendingHigh).toBe(expected);
    });

    it('does not count a high-priority order that is no longer pending', () => {
      const board = buildShiftBoard(
        [order('1', { priority: 'high', status: 'in-progress', takenBy: taken(ME) })],
        ME,
        now,
      );

      expect(board.pendingHigh).toBe(0);
    });

    it('lists the newest first', () => {
      const board = buildShiftBoard(
        [
          order('old', { createdAt: at(10) }),
          order('new', { createdAt: at(28) }),
          order('mid', { createdAt: at(20) }),
        ],
        ME,
        now,
      );

      expect(ids(board.pending)).toEqual(['new', 'mid', 'old']);
    });
  });

  describe('in progress and mine', () => {
    const board = () =>
      buildShiftBoard(
        [
          order('a', { status: 'in-progress', takenBy: taken(ME), createdAt: at(21) }),
          order('b', { status: 'in-progress', takenBy: taken(SOMEONE_ELSE), createdAt: at(22) }),
          order('c', { status: 'in-progress', takenBy: taken(ME), createdAt: at(23) }),
        ],
        ME,
        now,
      );

    it('counts every order in progress, whoever took it', () => {
      expect(ids(board().inProgress)).toEqual(['c', 'b', 'a']);
    });

    it('counts as mine only the ones taken by the current user', () => {
      expect(ids(board().mine)).toEqual(['c', 'a']);
    });

    it('has none of mine when nobody took anything with that user id', () => {
      expect(buildShiftBoard(board().inProgress, '999', now).mine).toEqual([]);
    });

    it('has none of mine without a current user', () => {
      expect(buildShiftBoard(board().inProgress, null, now).mine).toEqual([]);
    });

    it('does not count as mine an order that is already closed', () => {
      const result = buildShiftBoard(
        [
          order('x', {
            status: 'completed',
            takenBy: taken(ME),
            closingNote: closing(ME, at(30, 9)),
          }),
        ],
        ME,
        now,
      );

      expect(result.mine).toEqual([]);
    });
  });

  describe('closed today', () => {
    const closed = (id: string, status: WorkOrderStatus, closedAt: string) =>
      order(id, { status, takenBy: taken(ME), closingNote: closing(ME, closedAt) });

    it('counts completed and cancelled orders closed today', () => {
      const board = buildShiftBoard(
        [closed('1', 'completed', at(30, 9)), closed('2', 'cancelled', at(30, 14))],
        ME,
        now,
      );

      expect(ids(board.closedToday)).toEqual(['2', '1']);
    });

    it('leaves out an order closed yesterday', () => {
      const board = buildShiftBoard([closed('1', 'completed', at(29, 23))], ME, now);

      expect(board.closedToday).toEqual([]);
    });

    it('goes by the closing date, not the creation date', () => {
      const board = buildShiftBoard(
        [{ ...closed('1', 'completed', at(30, 8)), createdAt: at(1) }],
        ME,
        now,
      );

      expect(ids(board.closedToday)).toEqual(['1']);
    });

    it('does not count an order created today that is still open', () => {
      const board = buildShiftBoard([order('1', { createdAt: at(30, 8) })], ME, now);

      expect(board.closedToday).toEqual([]);
    });

    it('leaves out a closed order that has no closing note', () => {
      const board = buildShiftBoard([order('1', { status: 'completed' })], ME, now);

      expect(board.closedToday).toEqual([]);
    });

    it('counts the closings of every technician, not only mine', () => {
      const board = buildShiftBoard(
        [
          closed('1', 'completed', at(30, 9)),
          {
            ...order('2', { status: 'completed' }),
            takenBy: taken(SOMEONE_ELSE),
            closingNote: closing(SOMEONE_ELSE, at(30, 10)),
          },
        ],
        ME,
        now,
      );

      expect(board.closedToday).toHaveLength(2);
    });
  });

  it('builds an empty board from no orders', () => {
    expect(buildShiftBoard([], ME, now)).toEqual({
      pending: [],
      pendingHigh: 0,
      inProgress: [],
      mine: [],
      closedToday: [],
    });
  });

  it('does not reorder or modify the orders it receives', () => {
    const input = [order('1', { createdAt: at(10) }), order('2', { createdAt: at(28) })];
    const copy = structuredClone(input);

    buildShiftBoard(input, ME, now);

    expect(input).toEqual(copy);
  });

  it('sorts an order with an invalid date last instead of failing', () => {
    const board = buildShiftBoard(
      [order('bad', { createdAt: 'not a date' }), order('ok', { createdAt: at(28) })],
      ME,
      now,
    );

    expect(ids(board.pending)).toEqual(['ok', 'bad']);
  });
});
