/**
 * Clean floating point precision inaccuracies in backend numbers
 * @param {number|string} val
 * @param {number} decimals
 * @returns {number}
 */
const cleanFloat = (val, decimals = 6) => {
  const num = parseFloat(val);
  if (isNaN(num)) return 0;
  return Number(Math.round(num + 'e' + decimals) + 'e-' + decimals);
};

module.exports = {
  cleanFloat
};
