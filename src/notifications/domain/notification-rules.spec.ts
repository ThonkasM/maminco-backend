import {
  describeAvailability,
  describePriceChange,
} from './notification-rules';

describe('notification content', () => {
  it('describes a price increase', () => {
    const content = describePriceChange('PATO CRIOLLO', 250, 260);
    expect(content.title).toBe('Precio actualizado');
    expect(content.body).toContain('subió');
    expect(content.body).toContain('250,00');
  });

  it('describes a price decrease', () => {
    expect(describePriceChange('GASEOSA', 12, 10).body).toContain('bajó');
  });

  it('summarizes long availability lists', () => {
    const content = describeAvailability(['A', 'B', 'C', 'D', 'E'], false);
    expect(content.body).toContain('y 2 más');
    expect(content.title).toBe('Producto agotado');
  });

  it('uses singular and plural forms', () => {
    expect(describeAvailability(['A'], true).body).toContain('vuelve');
    expect(describeAvailability(['A', 'B'], true).body).toContain('vuelven');
  });
});
