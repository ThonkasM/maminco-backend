import {
  OrderHistoryPage,
  OrderHistoryRow,
} from './ports/order-query.repository';

type Meta = Record<string, any>;

function describe(
  entry: OrderHistoryRow,
  page: OrderHistoryPage,
): { emoji: string; label: string; detail: string } {
  const meta: Meta | null = entry.metadata;
  const fallback = entry.description;

  switch (entry.action) {
    case 'CREATED':
      return {
        emoji: '📝',
        label: 'Orden creada',
        detail: `Mesa ${page.tableName?.replace('Table ', '')} - ${page.areaName}`,
      };
    case 'ITEM_ADDED':
      return {
        emoji: '➕',
        label: 'Agregado',
        detail: meta?.productName
          ? `${meta.productName} x${meta.quantity}`
          : fallback,
      };
    case 'ITEM_REMOVED':
      return {
        emoji: '➖',
        label: 'Eliminado',
        detail: meta?.productName ? `${meta.productName}` : fallback,
      };
    case 'ITEM_QUANTITY_UPDATED':
      return {
        emoji: '✏️',
        label: 'Cantidad actualizada',
        detail: meta?.productName
          ? `${meta.productName} x${meta.oldQuantity || '?'} → x${meta.newQuantity || '?'}`
          : fallback,
      };
    case 'DISCOUNT_APPLIED':
      return {
        emoji: '💰',
        label: 'Descuento',
        detail: meta
          ? `${meta.reason || 'Sin descripción'} (-${meta.discountAmount || 0} Bs)`
          : fallback,
      };
    case 'TIP_ADDED':
      return {
        emoji: '🎁',
        label: 'Propina',
        detail: meta?.tipAmount ? `+${meta.tipAmount} Bs` : fallback,
      };
    case 'STATUS_CHANGED':
      return {
        emoji: '✅',
        label: 'Estado cambiado',
        detail: meta
          ? `${meta.oldStatus || '?'} → ${meta.newStatus || '?'}`
          : fallback,
      };
    default:
      return { emoji: '📝', label: entry.action, detail: fallback };
  }
}

export function buildTimeline(page: OrderHistoryPage) {
  const timeline = page.history.map((entry) => {
    const { emoji, label, detail } = describe(entry, page);
    return {
      id: entry.id,
      timestamp: entry.timestamp,
      time: entry.createdAt,
      user: entry.user.name,
      emoji,
      action: label,
      description: entry.description,
      detail,
      metadata: entry.metadata,
    };
  });

  return {
    id: page.id,
    orderNumber: page.orderNumber,
    status: page.status,
    tableName: page.tableName,
    areaName: page.areaName,
    createdAt: page.createdAt,
    pagination: page.pagination,
    timelineCount: timeline.length,
    timeline,
  };
}
