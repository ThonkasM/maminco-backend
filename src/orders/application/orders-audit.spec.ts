import type { BusinessCalendar } from './ports/business-calendar';
import type {
  AuditSearch,
  OrderQueryRepository,
} from './ports/order-query.repository';
import { OrdersQueryService } from './orders-query.service';

function build() {
  const searchAudit = jest.fn((filter: AuditSearch) => {
    void filter;
    return Promise.resolve({ data: [], total: 45 });
  });
  const queries = { searchAudit } as unknown as OrderQueryRepository;
  const calendar: BusinessCalendar = {
    today: () => Promise.resolve('2026-11-17'),
    bounds: (from, to) =>
      Promise.resolve({
        start: new Date(`${from}T04:00:00Z`),
        end: new Date(`${to}T04:00:00Z`),
      }),
  };
  return { service: new OrdersQueryService(queries, calendar), searchAudit };
}

describe('OrdersQueryService.audit', () => {
  it('defaults to the business day in progress', async () => {
    const { service, searchAudit } = build();
    const result = await service.audit({});
    expect(result.from).toBe('2026-11-17');
    expect(result.to).toBe('2026-11-17');
    expect(searchAudit).toHaveBeenCalledTimes(1);
    expect(result.totalPages).toBe(3);
  });

  it('orders a reversed range and converts it to UTC bounds', async () => {
    const { service, searchAudit } = build();
    const result = await service.audit({
      from: '2026-11-17',
      to: '2026-11-15',
    });
    expect(result.from).toBe('2026-11-15');
    expect(result.to).toBe('2026-11-17');
    const filter = searchAudit.mock.calls[0][0];
    expect(filter.start.toISOString()).toBe('2026-11-15T04:00:00.000Z');
    expect(filter.end.toISOString()).toBe('2026-11-17T04:00:00.000Z');
  });

  it('passes user, status, search and action group filters', async () => {
    const { service, searchAudit } = build();
    await service.audit({
      userId: 'u1',
      status: 'CLOSED',
      search: '  000012 ',
      actionGroup: 'money',
    });
    const filter = searchAudit.mock.calls[0][0];
    expect(filter).toMatchObject({
      userId: 'u1',
      status: 'CLOSED',
      search: '000012',
      actions: ['DISCOUNT_APPLIED', 'TIP_ADDED'],
      page: 1,
      limit: 20,
    });
  });
});
