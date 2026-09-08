(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StatisticsFinance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const inRange = (date, from, to) => Boolean(date) && (!from || date >= from) && (!to || date <= to);
  const overlaps = (row, from, to) => (!from || row.period_end >= from) && (!to || row.period_start <= to);

  function expectedRevenue({ worksheets, settlements, customers, from, to, today, worksheetValue, customerKey }) {
    const relevantSettlements = settlements.filter(row => row.settlement_kind !== "flat_monthly" && overlaps(row, from, to));
    const linkedWorksheetIds = new Set();
    let total = 0;

    for (const settlement of relevantSettlements) {
      total += Number(settlement.total) || 0;
      for (const id of settlement.worksheet_ids || []) linkedWorksheetIds.add(id);
    }

    for (const sheet of worksheets) {
      if (!inRange(sheet.date, from, to) || linkedWorksheetIds.has(sheet.id)) continue;
      total += Number(worksheetValue(sheet)) || 0;
    }
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }

  return { expectedRevenue };
});
