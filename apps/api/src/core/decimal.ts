import { Decimal128 } from 'mongodb';

/**
 * Decimal exacto (entero escalado con BigInt). Sirve para validar escala, comparar y sumar en la aplicación;
 * en Mongo el valor se guarda como `Decimal128` y las sumas de existencias las hace el servidor (`$inc`, `$sum`).
 * Nunca se pasa por `number`.
 */
export class Decimal {
  private constructor(private readonly units: bigint, private readonly scale: number) {}

  static readonly ZERO = new Decimal(0n, 0);

  /** Acepta `"12"`, `"-0.30"` y la notación exponencial que puede devolver `Decimal128.toString()` (`"1.0E+2"`). */
  static parse(value: string): Decimal {
    const match = /^([+-])?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value.trim());
    if (!match) throw new Error(`Invalid decimal: ${value}`);
    const [, sign, integer, fraction = '', exponent = '0'] = match;
    let digits = BigInt(integer + fraction);
    let scale = fraction.length - Number(exponent);
    if (scale < 0) {
      digits *= 10n ** BigInt(-scale);
      scale = 0;
    }
    return new Decimal(sign === '-' ? -digits : digits, scale);
  }

  static from(value: Decimal128 | string): Decimal {
    return Decimal.parse(typeof value === 'string' ? value : value.toString());
  }

  private static align(a: Decimal, b: Decimal): [bigint, bigint, number] {
    const scale = Math.max(a.scale, b.scale);
    return [a.units * 10n ** BigInt(scale - a.scale), b.units * 10n ** BigInt(scale - b.scale), scale];
  }

  add(other: Decimal): Decimal {
    const [a, b, scale] = Decimal.align(this, other);
    return new Decimal(a + b, scale);
  }

  sub(other: Decimal): Decimal {
    return this.add(other.neg());
  }

  neg(): Decimal {
    return new Decimal(-this.units, this.scale);
  }

  abs(): Decimal {
    return this.units < 0n ? this.neg() : this;
  }

  compare(other: Decimal): -1 | 0 | 1 {
    const [a, b] = Decimal.align(this, other);
    return a === b ? 0 : a < b ? -1 : 1;
  }

  eq(other: Decimal): boolean {
    return this.compare(other) === 0;
  }

  isZero(): boolean {
    return this.units === 0n;
  }

  isNegative(): boolean {
    return this.units < 0n;
  }

  isPositive(): boolean {
    return this.units > 0n;
  }

  /** Cifras decimales significativas (sin ceros a la derecha): `"1.50"` → 1. */
  significantScale(): number {
    let { units, scale } = this;
    while (scale > 0 && units % 10n === 0n) {
      units /= 10n;
      scale--;
    }
    return scale;
  }

  /** Forma canónica sin ceros sobrantes: `"0.30"` → `"0.3"`, `"-0"` → `"0"`. */
  toString(): string {
    const scale = this.significantScale();
    const units = this.units / 10n ** BigInt(this.scale - scale);
    const negative = units < 0n;
    const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
    const integer = digits.slice(0, digits.length - scale);
    const fraction = digits.slice(digits.length - scale);
    return `${negative ? '-' : ''}${integer}${scale > 0 ? `.${fraction}` : ''}`;
  }

  toDecimal128(): Decimal128 {
    return Decimal128.fromString(this.toString());
  }
}

export const toDecimal128 = (value: string): Decimal128 => Decimal.parse(value).toDecimal128();

/** Texto canónico de un `Decimal128` guardado (o `null`). */
export function decimalToString(value: Decimal128): string;
export function decimalToString(value: Decimal128 | null): string | null;
export function decimalToString(value: Decimal128 | null): string | null {
  return value === null ? null : Decimal.from(value).toString();
}
