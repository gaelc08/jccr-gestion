function numberDisplay(value, digits = 0) {
  return Number(value ?? 0).toFixed(digits).replace(".", ",");
}
function currencyDisplay(value) {
  return `${numberDisplay(value, 2)} \u20AC`;
}
export {
  currencyDisplay,
  numberDisplay
};
