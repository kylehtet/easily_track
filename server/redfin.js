// Node port of the calls made by the `reteps/redfin` Python library
// (https://github.com/reteps/redfin) — a wrapper around Redfin's *unofficial*
// internal JSON API. No key, but it is undocumented, against Redfin's ToS, and
// can break or rate-limit at any time. OFF by default; set REDFIN_ENABLED=1 to
// opt in. Intended for personal, low-volume use only.
//
// HEADS UP: Redfin fronts these endpoints with a CloudFront WAF that blocks
// plain server-side clients (403) by TLS fingerprint + IP reputation, headers
// notwithstanding. It may work from a residential IP (a laptop running the dev
// server) and will almost certainly be blocked from a cloud deploy. This module
// fails soft — a block just returns null and the lookup chain moves on.

const BASE = 'https://www.redfin.com/stingray/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const posNum = (x) => {
  const n = Number(x && typeof x === 'object' ? x.value : x);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const plain = (x) => (x && typeof x === 'object' ? x.value ?? null : x ?? null);

async function rf(path, params) {
  const url = BASE + path + '?' + new URLSearchParams(params).toString();
  const opts = { headers: { 'User-Agent': UA, Accept: '*/*' } };
  let res = await fetch(url, opts);
  if (res.status === 429) {
    await sleep((Number(res.headers.get('retry-after')) || 2) * 1000);
    res = await fetch(url, opts);
  }
  if (!res.ok) throw new Error(`redfin ${path} → ${res.status}`);
  const text = await res.text();
  return JSON.parse(text.startsWith('{}&&') ? text.slice(4) : text);
}

/**
 * @param {string} full  "street, city, ST zip"
 * @returns {Promise<null | {
 *   value, rentEstimate, lastSalePrice, lastSaleDate,
 *   taxAnnual, beds, baths, sqft, yearBuilt
 * }>}
 */
export async function redfinLookup(full) {
  if (!process.env.REDFIN_ENABLED) return null;
  try {
    const search = await rf('do/location-autocomplete', { location: full, v: 2 });
    const rows =
      search?.payload?.sections?.flatMap((s) => s.rows || []) || [];
    const path =
      search?.payload?.exactMatch?.url ||
      rows.find((r) => r?.url && /\/home\//.test(r.url))?.url ||
      rows[0]?.url;
    if (!path) return null;

    const info = await rf('api/home/details/initialInfo', {
      path,
      accessLevel: 3,
    });
    const propertyId = info?.payload?.propertyId;
    const listingId = info?.payload?.listingId ?? '';
    if (!propertyId) return null;

    const settle = (p) => p.catch(() => null);
    const [avm, rental, btf] = await Promise.all([
      settle(rf('api/home/details/avm', { propertyId, listingId, accessLevel: 3 })),
      settle(
        rf('api/home/details/rental-estimate', {
          propertyId,
          listingId,
          accessLevel: 3,
        })
      ),
      settle(
        rf('api/home/details/belowTheFold', {
          propertyId,
          pageType: 3,
          accessLevel: 3,
        })
      ),
    ]);

    const value =
      avm?.payload?.predictedValue ?? avm?.payload?.avm?.predictedValue ?? null;
    const rent =
      rental?.payload?.predictedValue ??
      rental?.payload?.rentalEstimateInfo?.predictedValue ??
      rental?.payload?.avmRentalInfo?.predictedValue ??
      null;

    const pub = btf?.payload?.publicRecordsInfo || {};
    const basic = pub.basicInfo || {};
    const events =
      btf?.payload?.propertyHistoryInfo?.events ||
      pub.propertyHistoryInfo?.events ||
      [];
    const sold =
      events.find((e) => /sold/i.test(e?.eventDescription || '') && e?.price) ||
      events.find((e) => e?.price);

    return {
      value: posNum(value),
      rentEstimate: posNum(rent),
      beds: plain(basic.beds) ?? null,
      baths: plain(basic.baths) ?? plain(basic.totalBaths) ?? null,
      sqft: posNum(basic.sqFt ?? basic.totalSqFt),
      yearBuilt: plain(basic.yearBuilt) ?? null,
      lastSalePrice: posNum(sold?.price),
      lastSaleDate: sold?.eventDate
        ? new Date(sold.eventDate).toISOString().slice(0, 10)
        : null,
      taxAnnual: posNum(pub.taxInfo?.taxesDue),
    };
  } catch {
    return null;
  }
}
