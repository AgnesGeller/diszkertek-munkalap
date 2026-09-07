(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StatisticsFinance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const monthKey = value => String(value || "").slice(0, 7);
  const inRange = (date, from, to) => Boolean(date) && (!from || date >= from) && (!to || date <= to);
  const overlaps = (row, from, to) => (!from || row.period_end >= from) && (!to || row.period_start <= to);

  function monthsBetween(from, to) {
    if (!from || !to || to < from) return [];
    const cursor = new Date(`${from.slice(0, 7)}-01T12:00:00`);
    const last = to.slice(0, 7);
    const months = [];
    while (monthKey(cursor.toISOString()) <= last) {
      months.push(monthKey(cursor.toISOString()));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  function expectedRevenue({ worksheets, settlements, customers, from, to, today, worksheetValue, customerKey }) {
    const relevantSettlements = settlements.filter(row => row.settlement_kind === "flat_monthly"
      ? inRange(row.billing_month || row.period_start, from, to)
      : overlaps(row, from, to));
    const linkedWorksheetIds = new Set();
    let total = 0;

    for (const settlement of relevantSettlements) {
      total += Number(settlement.total) || 0;
      if (settlement.settlement_kind !== "flat_monthly") {
        for (const id of settlement.worksheet_ids || []) linkedWorksheetIds.add(id);
      }
    }

    const customerById = new Map(customers.map(customer => [customer.id, customer]));
    const customerByName = new Map(customers.map(customer => [customerKey(customer.fullName), customer]));
    for (const sheet of worksheets) {
      if (!inRange(sheet.date, from, to) || linkedWorksheetIds.has(sheet.id)) continue;
      const customer = customerById.get(sheet.customerId) || customerByName.get(customerKey(sheet.customer));
      if (customer?.billingMode === "flat_monthly") continue;
      total += Number(worksheetValue(sheet)) || 0;
    }

    const currentMonth = monthKey(today);
    const lastMonth = !to || monthKey(to) > currentMonth ? currentMonth : monthKey(to);
    const firstMonth = monthKey(from);
    const existingFlat = new Set(relevantSettlements
      .filter(row => row.settlement_kind === "flat_monthly")
      .map(row => `${row.customer_id || customerKey(row.customer_name)}:${monthKey(row.billing_month || row.period_start)}`));

    for (const customer of customers) {
      if (customer.active === false || customer.billingMode !== "flat_monthly" || customer.monthlyFlatFee == null) continue;
      const startMonth = monthKey(customer.flatFeeStartMonth || firstMonth);
      for (const month of monthsBetween(`${firstMonth}-01`, `${lastMonth}-01`)) {
        if (month < startMonth) continue;
        if (!inRange(`${month}-01`, from, to)) continue;
        const idKey = `${customer.id}:${month}`;
        const nameKey = `${customerKey(customer.fullName)}:${month}`;
        if (!existingFlat.has(idKey) && !existingFlat.has(nameKey)) total += Number(customer.monthlyFlatFee) || 0;
      }
    }
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }

  return { expectedRevenue };
});
