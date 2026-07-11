// display-format.ts — Number & currency display helpers

export function numberDisplay(value: unknown, digits = 0): string {
  return Number(value ?? 0).toFixed(digits).replace('.', ',');
}

export function currencyDisplay(value: unknown): string {
  return `${numberDisplay(value, 2)} €`;
}
