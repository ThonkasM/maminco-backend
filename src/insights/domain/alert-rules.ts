export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface OpenOrderSnapshot {
  orderNumber: string;
  table: string;
  minutesOpen: number;
  total: number;
}

export interface KitchenDelaySnapshot {
  orderNumber: string;
  table: string;
  minutesWaiting: number;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  localHour: number;
  salesToday: number;
  ordersToday: number;
  baselineSales: number | null;
  discountRateToday: number;
  discountRateBaseline: number;
  cancelledToday: number;
  cancelledBaseline: number;
  tablesOccupied: number;
  tablesTotal: number;
  openOrders: OpenOrderSnapshot[];
  kitchenPending: KitchenDelaySnapshot[];
}

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  metric?: string;
  value?: number;
  baseline?: number;
}

const duration = (minutes: number) => {
  if (minutes >= 2880) return `${Math.round(minutes / 1440)} días`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
};

const bs = (value: number) =>
  `Bs. ${Math.round(value).toLocaleString('es-BO')}`;

export function evaluateAlerts(snapshot: MonitoringSnapshot): Alert[] {
  const alerts: Alert[] = [];
  const { baselineSales, salesToday, ordersToday, localHour } = snapshot;

  if (baselineSales && baselineSales > 0 && localHour >= 14) {
    const ratio = salesToday / baselineSales;
    if (ratio < 0.35) {
      alerts.push({
        id: 'sales_drop',
        severity: 'critical',
        title: 'Ventas muy por debajo de lo habitual',
        detail: `Llevas ${bs(salesToday)} y a esta hora suele haber ${bs(baselineSales)} (${Math.round(ratio * 100)} %).`,
        metric: 'sales',
        value: salesToday,
        baseline: baselineSales,
      });
    } else if (ratio < 0.6) {
      alerts.push({
        id: 'sales_drop',
        severity: 'warning',
        title: 'Ventas por debajo de lo habitual',
        detail: `Llevas ${bs(salesToday)} frente a ${bs(baselineSales)} de un día equivalente (${Math.round(ratio * 100)} %).`,
        metric: 'sales',
        value: salesToday,
        baseline: baselineSales,
      });
    } else if (ratio > 1.5) {
      alerts.push({
        id: 'sales_surge',
        severity: 'info',
        title: 'Día más fuerte de lo habitual',
        detail: `Llevas ${bs(salesToday)}, un ${Math.round((ratio - 1) * 100)} % más que un día equivalente.`,
        metric: 'sales',
        value: salesToday,
        baseline: baselineSales,
      });
    }
  }

  if (
    ordersToday >= 5 &&
    snapshot.discountRateToday >
      Math.max(0.08, snapshot.discountRateBaseline * 2)
  ) {
    alerts.push({
      id: 'discount_spike',
      severity: 'warning',
      title: 'Descuentos altos hoy',
      detail: `Los descuentos son el ${(snapshot.discountRateToday * 100).toFixed(1)} % de la venta, contra ${(snapshot.discountRateBaseline * 100).toFixed(1)} % habitual.`,
      metric: 'discount_rate',
      value: snapshot.discountRateToday,
      baseline: snapshot.discountRateBaseline,
    });
  }

  const longOpen = snapshot.openOrders.filter(
    (order) => order.minutesOpen >= 120,
  );
  if (longOpen.length > 0) {
    const worst = Math.max(...longOpen.map((order) => order.minutesOpen));
    alerts.push({
      id: 'long_open_orders',
      severity: worst >= 180 ? 'critical' : 'warning',
      title: `${longOpen.length} ${longOpen.length === 1 ? 'orden abierta' : 'órdenes abiertas'} hace más de 2 horas`,
      detail: longOpen
        .slice(0, 4)
        .map(
          (order) =>
            `Mesa ${order.table} (${duration(order.minutesOpen)}, ${bs(order.total)})`,
        )
        .join(' · '),
      metric: 'open_minutes',
      value: worst,
    });
  }

  const delayed = snapshot.kitchenPending.filter(
    (order) => order.minutesWaiting >= 20,
  );
  if (delayed.length > 0) {
    const worst = Math.max(...delayed.map((order) => order.minutesWaiting));
    alerts.push({
      id: 'kitchen_delay',
      severity: worst >= 40 ? 'critical' : 'warning',
      title: `${delayed.length} pedido${delayed.length === 1 ? '' : 's'} esperando en cocina`,
      detail: delayed
        .slice(0, 4)
        .map(
          (order) => `Mesa ${order.table} (${duration(order.minutesWaiting)})`,
        )
        .join(' · '),
      metric: 'kitchen_minutes',
      value: worst,
    });
  }

  if (
    snapshot.cancelledToday >= 3 &&
    snapshot.cancelledToday > snapshot.cancelledBaseline * 2
  ) {
    alerts.push({
      id: 'cancellations',
      severity: 'warning',
      title: 'Más cancelaciones de lo normal',
      detail: `Hoy hay ${snapshot.cancelledToday} órdenes canceladas; el promedio diario es ${snapshot.cancelledBaseline.toFixed(1)}.`,
      metric: 'cancelled',
      value: snapshot.cancelledToday,
      baseline: snapshot.cancelledBaseline,
    });
  }

  if (
    snapshot.tablesTotal >= 5 &&
    snapshot.tablesOccupied / snapshot.tablesTotal >= 0.9
  ) {
    alerts.push({
      id: 'high_occupancy',
      severity: 'info',
      title: 'Salón casi lleno',
      detail: `${snapshot.tablesOccupied} de ${snapshot.tablesTotal} mesas ocupadas.`,
      metric: 'occupancy',
      value: snapshot.tablesOccupied / snapshot.tablesTotal,
    });
  }

  const order: Record<AlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
