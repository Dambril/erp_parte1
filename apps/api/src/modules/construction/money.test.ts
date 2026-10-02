import { formatDate, formatMoney, formatNumber, MoneyStringSchema, negateMoney, NonZeroMoneySchema, parseMoneyInput } from '@erp/domain';

describe('dinero como string (packages/domain)', () => {
  it('valida dos decimales exactos', () => {
    for (const valid of ['38600000.00', '0.10', '-1200.50']) expect(MoneyStringSchema.safeParse(valid).success).toBe(true);
    for (const invalid of ['100', '100.5', '100.555', '1e3', '', '1,000.00', 100.5]) expect(MoneyStringSchema.safeParse(invalid).success).toBe(false);
    expect(NonZeroMoneySchema.safeParse('0.00').success).toBe(false);
    expect(NonZeroMoneySchema.safeParse('-0.00').success).toBe(false);
  });

  it('da formato visual sobre el string, sin pasar por number', () => {
    expect(formatMoney('38600000.00')).toBe('$38,600,000.00');
    expect(formatMoney('-1200.50')).toBe('-$1,200.50');
    expect(formatMoney('0.30')).toBe('$0.30');
    // Un number perdería precisión con esta cifra.
    expect(formatMoney('9007199254740993.01')).toBe('$9,007,199,254,740,993.01');
  });

  it('obtiene el monto contrario', () => {
    expect(negateMoney('1200.00')).toBe('-1200.00');
    expect(negateMoney('-1200.00')).toBe('1200.00');
  });

  it('interpreta lo que escribe una persona', () => {
    expect(parseMoneyInput('1,200,000')).toBe('1200000.00');
    expect(parseMoneyInput('$ 1200000.5')).toBe('1200000.50');
    expect(parseMoneyInput('0.10')).toBe('0.10');
    expect(parseMoneyInput('007')).toBe('7.00');
    for (const invalid of ['', '0', '0.00', '-5', '1.234', 'abc', '1.2.3']) expect(parseMoneyInput(invalid)).toBeNull();
  });

  it('da formato a fechas y cifras', () => {
    expect(formatDate('2026-03-14')).toBe('14 mar 2026');
    expect(formatDate('2026-12-01T10:00:00.000Z')).toBe('1 dic 2026');
    expect(formatNumber(5200)).toBe('5,200');
    expect(formatNumber(95)).toBe('95');
  });
});
