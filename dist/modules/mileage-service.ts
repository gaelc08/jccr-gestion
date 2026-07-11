// mileage-service.ts — French fiscal mileage scale (barème kilométrique)
import type { Coach } from '../../src/types/index.js';

// ─── Types ─────────────────────────────────────────────────────────────────
export type FiscalBand = 3 | 4 | 5 | 6 | 7;

interface MileageScaleRow {
  upTo5000: number;
  midRate: number;
  midFixed: number;
  over20000: number;
}

export interface MileageKeyBreakdown {
  km: number;
  amount: number;
  cumulativeKmBefore: number;
  cumulativeKmAfter: number;
  effectiveRate: number;
}

export interface MileageYearBreakdown {
  byKey: Record<string, MileageKeyBreakdown>;
  totalKm: number;
  usesLegalScale: boolean;
}

export interface MileageMonthBreakdown {
  totalKm: number;
  totalAmount: number;
  byKey: Record<string, MileageKeyBreakdown>;
  usesLegalScale: boolean;
}

export interface MileageServiceOptions {
  timeData?: Record<string, { km?: number; [key: string]: unknown }>;
}

// ─── Barème officiel (année fiscale courante) ────────────────────────────────────
const MILEAGE_SCALE: Record<FiscalBand, MileageScaleRow> = {
  3: { upTo5000: 0.529, midRate: 0.316, midFixed: 1065, over20000: 0.370 },
  4: { upTo5000: 0.606, midRate: 0.340, midFixed: 1330, over20000: 0.407 },
  5: { upTo5000: 0.636, midRate: 0.357, midFixed: 1395, over20000: 0.427 },
  6: { upTo5000: 0.665, midRate: 0.374, midFixed: 1457, over20000: 0.447 },
  7: { upTo5000: 0.697, midRate: 0.394, midFixed: 1515, over20000: 0.470 },
};

// ─── Fonctions ──────────────────────────────────────────────────────────────────
export function parseFiscalPower(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getMileageScaleBand(fiscalPower: unknown): FiscalBand | null {
  const parsed = parseFiscalPower(fiscalPower);
  if (!parsed) return null;
  if (parsed <= 3) return 3;
  if (parsed >= 7) return 7;
  return parsed as FiscalBand;
}

export function getLegacyKmRateFromFiscalPower(fiscalPower: unknown): number {
  const band = getMileageScaleBand(fiscalPower);
  return band ? MILEAGE_SCALE[band].upTo5000 : 0;
}

export function formatNumberFr(value: unknown, digits = 3): string {
  return Number(value ?? 0).toFixed(digits).replace('.', ',');
}

export function getMileageScaleDescription(fiscalPower: unknown): string {
  const band = getMileageScaleBand(fiscalPower);
  if (!band) return 'Barème non disponible';
  const scale = MILEAGE_SCALE[band];
  const bandLabel = band === 3 ? '3 CV et moins' : band === 7 ? '7 CV et plus' : `${band} CV`;
  return `${bandLabel} — jusqu'à 5 000 km : ${formatNumberFr(scale.upTo5000)} €/km`;
}

export function calculateAnnualMileageAmount(distanceKm: number, fiscalPower: unknown): number {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const band = getMileageScaleBand(fiscalPower);
  if (!distance || !band) return 0;
  const scale = MILEAGE_SCALE[band];
  if (distance <= 5000) return distance * scale.upTo5000;
  if (distance <= 20000) return distance * scale.midRate + scale.midFixed;
  return distance * scale.over20000;
}

export function getMileageYearBreakdown(
  coach: Partial<Coach> | null | undefined,
  year: string | number,
  { timeData = {} }: MileageServiceOptions = {}
): MileageYearBreakdown {
  const breakdown: MileageYearBreakdown = {
    byKey: {},
    totalKm: 0,
    usesLegalScale: Boolean(getMileageScaleBand((coach as Record<string, unknown>)?.fiscal_power)),
  };

  if (!coach?.id || !year) return breakdown;

  const fiscalPower = parseFiscalPower((coach as Record<string, unknown>).fiscal_power);
  const fallbackKmRate = Number((coach as Record<string, unknown>).km_rate) || 0;
  let cumulativeKm = 0;

  Object.keys(timeData)
    .filter((key) => key.startsWith(`${coach.id}-${year}-`))
    .sort()
    .forEach((key) => {
      const data = timeData[key] ?? {};
      const km = Math.max(0, Number(data.km) || 0);
      const previousKm = cumulativeKm;
      cumulativeKm += km;

      const amount = fiscalPower
        ? calculateAnnualMileageAmount(cumulativeKm, fiscalPower) -
          calculateAnnualMileageAmount(previousKm, fiscalPower)
        : km * fallbackKmRate;

      breakdown.byKey[key] = {
        km,
        amount,
        cumulativeKmBefore: previousKm,
        cumulativeKmAfter: cumulativeKm,
        effectiveRate: km > 0 ? amount / km : 0,
      };
    });

  breakdown.totalKm = cumulativeKm;
  breakdown.usesLegalScale = Boolean(fiscalPower);
  return breakdown;
}

export function getMonthlyMileageBreakdown(
  coach: Partial<Coach> | null | undefined,
  monthValue: string,
  options: MileageServiceOptions = {}
): MileageMonthBreakdown {
  if (!coach || !monthValue) {
    return { totalKm: 0, totalAmount: 0, byKey: {}, usesLegalScale: false };
  }

  const [year, month] = monthValue.split('-');
  const yearBreakdown = getMileageYearBreakdown(coach, year, options);
  const byKey: Record<string, MileageKeyBreakdown> = {};
  let totalKm = 0;
  let totalAmount = 0;

  for (const [key, value] of Object.entries(yearBreakdown.byKey)) {
    if (!key.startsWith(`${coach.id}-${year}-${month}`)) continue;
    byKey[key] = value;
    totalKm += value.km;
    totalAmount += value.amount;
  }

  return { totalKm, totalAmount, byKey, usesLegalScale: yearBreakdown.usesLegalScale };
}
