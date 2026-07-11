const MILEAGE_SCALE = {
  3: { upTo5000: 0.529, midRate: 0.316, midFixed: 1065, over20000: 0.37 },
  4: { upTo5000: 0.606, midRate: 0.34, midFixed: 1330, over20000: 0.407 },
  5: { upTo5000: 0.636, midRate: 0.357, midFixed: 1395, over20000: 0.427 },
  6: { upTo5000: 0.665, midRate: 0.374, midFixed: 1457, over20000: 0.447 },
  7: { upTo5000: 0.697, midRate: 0.394, midFixed: 1515, over20000: 0.47 }
};
function parseFiscalPower(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function getMileageScaleBand(fiscalPower) {
  const parsed = parseFiscalPower(fiscalPower);
  if (!parsed) return null;
  if (parsed <= 3) return 3;
  if (parsed >= 7) return 7;
  return parsed;
}
function getLegacyKmRateFromFiscalPower(fiscalPower) {
  const band = getMileageScaleBand(fiscalPower);
  return band ? MILEAGE_SCALE[band].upTo5000 : 0;
}
function formatNumberFr(value, digits = 3) {
  return Number(value ?? 0).toFixed(digits).replace(".", ",");
}
function getMileageScaleDescription(fiscalPower) {
  const band = getMileageScaleBand(fiscalPower);
  if (!band) return "Bar\xE8me non disponible";
  const scale = MILEAGE_SCALE[band];
  const bandLabel = band === 3 ? "3 CV et moins" : band === 7 ? "7 CV et plus" : `${band} CV`;
  return `${bandLabel} \u2014 jusqu'\xE0 5\xA0000\xA0km\xA0: ${formatNumberFr(scale.upTo5000)}\xA0\u20AC/km`;
}
function calculateAnnualMileageAmount(distanceKm, fiscalPower) {
  const distance = Math.max(0, Number(distanceKm) || 0);
  const band = getMileageScaleBand(fiscalPower);
  if (!distance || !band) return 0;
  const scale = MILEAGE_SCALE[band];
  if (distance <= 5e3) return distance * scale.upTo5000;
  if (distance <= 2e4) return distance * scale.midRate + scale.midFixed;
  return distance * scale.over20000;
}
function getMileageYearBreakdown(coach, year, { timeData = {} } = {}) {
  const breakdown = {
    byKey: {},
    totalKm: 0,
    usesLegalScale: Boolean(getMileageScaleBand(coach?.fiscal_power))
  };
  if (!coach?.id || !year) return breakdown;
  const fiscalPower = parseFiscalPower(coach.fiscal_power);
  const fallbackKmRate = Number(coach.km_rate) || 0;
  let cumulativeKm = 0;
  Object.keys(timeData).filter((key) => key.startsWith(`${coach.id}-${year}-`)).sort().forEach((key) => {
    const data = timeData[key] ?? {};
    const km = Math.max(0, Number(data.km) || 0);
    const previousKm = cumulativeKm;
    cumulativeKm += km;
    const amount = fiscalPower ? calculateAnnualMileageAmount(cumulativeKm, fiscalPower) - calculateAnnualMileageAmount(previousKm, fiscalPower) : km * fallbackKmRate;
    breakdown.byKey[key] = {
      km,
      amount,
      cumulativeKmBefore: previousKm,
      cumulativeKmAfter: cumulativeKm,
      effectiveRate: km > 0 ? amount / km : 0
    };
  });
  breakdown.totalKm = cumulativeKm;
  breakdown.usesLegalScale = Boolean(fiscalPower);
  return breakdown;
}
function getMonthlyMileageBreakdown(coach, monthValue, options = {}) {
  if (!coach || !monthValue) {
    return { totalKm: 0, totalAmount: 0, byKey: {}, usesLegalScale: false };
  }
  const [year, month] = monthValue.split("-");
  const yearBreakdown = getMileageYearBreakdown(coach, year, options);
  const byKey = {};
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
export {
  calculateAnnualMileageAmount,
  formatNumberFr,
  getLegacyKmRateFromFiscalPower,
  getMileageScaleBand,
  getMileageScaleDescription,
  getMileageYearBreakdown,
  getMonthlyMileageBreakdown,
  parseFiscalPower
};
