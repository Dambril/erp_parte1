import { Decimal128 } from 'mongodb';
import { Decimal, decimalToString, moneyToString, toDecimal128 } from './decimal';

describe('Decimal', () => {
  it('adds 0.1 + 0.2 exactly (a float would give 0.30000000000000004)', () => {
    expect(Decimal.parse('0.1').add(Decimal.parse('0.2')).toString()).toBe('0.3');
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('subtracts, negates and compares without losing precision', () => {
    const a = Decimal.parse('1000000000000000000.0000000001');
    expect(a.sub(Decimal.parse('0.0000000001')).toString()).toBe('1000000000000000000');
    expect(Decimal.parse('0.3').sub(Decimal.parse('0.1')).sub(Decimal.parse('0.2')).isZero()).toBe(true);
    expect(Decimal.parse('-2.5').abs().toString()).toBe('2.5');
    expect(Decimal.parse('1.10').compare(Decimal.parse('1.1'))).toBe(0);
    expect(Decimal.parse('-0.01').compare(Decimal.ZERO)).toBe(-1);
  });

  it('reads the exponent notation that Decimal128 may produce', () => {
    expect(Decimal.parse('1.0E+2').toString()).toBe('100');
    expect(Decimal.parse('5E-3').toString()).toBe('0.005');
  });

  it('reports significant decimal places', () => {
    expect(Decimal.parse('1.500').significantScale()).toBe(1);
    expect(Decimal.parse('12').significantScale()).toBe(0);
  });

  it('round-trips through Decimal128 in canonical form', () => {
    expect(decimalToString(toDecimal128('0.30'))).toBe('0.3');
    expect(decimalToString(Decimal128.fromString('-0'))).toBe('0');
    expect(decimalToString(null)).toBeNull();
  });

  it('formats money with exactly two decimals', () => {
    expect(moneyToString(Decimal128.fromString('1500'))).toBe('1500.00');
    expect(moneyToString(Decimal128.fromString('38600000.5'))).toBe('38600000.50');
    expect(moneyToString(Decimal128.fromString('-0.3'))).toBe('-0.30');
    expect(moneyToString(Decimal128.fromString('1.0E+2'))).toBe('100.00');
    expect(moneyToString(Decimal128.fromString('-0'))).toBe('0.00');
  });

  it('rejects non-decimal input', () => {
    expect(() => Decimal.parse('1,5')).toThrow('Invalid decimal');
    expect(() => Decimal.parse('abc')).toThrow('Invalid decimal');
  });
});
