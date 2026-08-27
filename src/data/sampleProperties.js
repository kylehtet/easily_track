// Seed data shown on first visit (before anything is saved to localStorage).
// Delete these from the dashboard once you add your own.

const daysAgo = (d) => Date.now() - d * 864e5;
const thisMonth = () => new Date().toISOString().slice(0, 7);

export function seedProperties() {
  return [
    {
      id: 'p1',
      street: '1847 Fulton St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94117',
      rent: 4200,
      financing: { downPct: 20, ratePct: 4, termYears: 30 },
      meta: { beds: 3, baths: 2, sqft: 1680, yearBuilt: 1912 },
      base: { mortgage: 2400, tax: 520, insurance: 140, repairs: 80, utilities: 0, pge: 0, water: 90, recology: 60, hoa: 0 },
      extras: [],
      mgmt: { type: 'ziprent', feeMode: 'pct', feeVal: 8, payment: 'Ziprent direct deposit' },
      prevNet: 454,
      updatedAt: daysAgo(3),
      reviewedMonth: thisMonth(),
      purchasePrice: 1050000,
      purchaseDate: '2019-06-15',
      value: 1240000,
      valueHistory: [
        { date: '2019-06-15', value: 1050000 },
        { date: '2021-07-01', value: 1210000 },
        { date: '2023-01-01', value: 1300000 },
        { date: '2024-09-01', value: 1240000 },
      ],
    },
    {
      id: 'p2',
      street: '2210 Blake St',
      city: 'Berkeley',
      state: 'CA',
      zip: '94704',
      rent: 3100,
      financing: { downPct: 25, ratePct: 4.5, termYears: 30 },
      meta: { beds: 2, baths: 1, sqft: 1120, yearBuilt: 1925 },
      base: { mortgage: 1750, tax: 410, insurance: 110, repairs: 150, utilities: 0, pge: 0, water: 70, recology: 55, hoa: 0 },
      extras: [],
      mgmt: { type: 'personal', feeMode: 'flat', feeVal: 0, payment: 'Zelle' },
      prevNet: 610,
      updatedAt: daysAgo(12),
      reviewedMonth: null,
      purchasePrice: 890000,
      purchaseDate: '2018-03-20',
      value: 1075000,
      valueHistory: [
        { date: '2018-03-20', value: 890000 },
        { date: '2020-06-01', value: 980000 },
        { date: '2022-06-01', value: 1120000 },
        { date: '2024-06-01', value: 1075000 },
      ],
    },
    {
      id: 'p3',
      street: '764 Hillcrest Ct',
      city: 'Daly City',
      state: 'CA',
      zip: '94014',
      rent: 2950,
      financing: { downPct: 20, ratePct: 3, termYears: 30 },
      meta: { beds: 3, baths: 2.5, sqft: 1540, yearBuilt: 1978 },
      base: { mortgage: 2100, tax: 380, insurance: 95, repairs: 0, utilities: 0, pge: 0, water: 0, recology: 0, hoa: 320 },
      extras: [{ label: 'HOA violation', amount: 150 }],
      mgmt: { type: 'ziprent', feeMode: 'pct', feeVal: 8, payment: 'Ziprent direct deposit' },
      prevNet: -45,
      updatedAt: daysAgo(55),
      reviewedMonth: null,
      purchasePrice: 985000,
      purchaseDate: '2021-09-10',
      value: 1030000,
      valueHistory: [
        { date: '2021-09-10', value: 985000 },
        { date: '2023-03-01', value: 1005000 },
        { date: '2024-08-01', value: 1030000 },
      ],
    },
  ];
}
