import { useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import SummaryBar from './components/SummaryBar.jsx';
import SortFilterBar from './components/SortFilterBar.jsx';
import PropertyCard from './components/PropertyCard.jsx';
import PropertyPage from './components/PropertyPage.jsx';
import { BASE_COSTS, netIncome, num, appreciationPct } from './lib/calculations.js';
import { loadList, saveList } from './lib/storage.js';
import { loadRemote, saveRemote } from './lib/remoteStore.js';
import { getCapabilities, lookupProperty } from './lib/realEstateData.js';
import { estimateValueFromPurchase } from './lib/estimates.js';
import { uid } from './lib/id.js';

const currentYM = () => new Date().toISOString().slice(0, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (accountId) =>
  accountId ? `the-ledger:lastmonth:${accountId}` : 'the-ledger:lastmonth';

/** Log a new value point when it differs from the last one; seed from purchase. */
function withValueHistory(prev, fields) {
  const history = Array.isArray(prev?.valueHistory) ? prev.valueHistory.slice() : [];
  if (history.length === 0 && num(fields.purchasePrice) > 0) {
    history.push({
      date: fields.purchaseDate || todayISO(),
      value: num(fields.purchasePrice),
    });
  }
  const v = num(fields.value);
  const last = history[history.length - 1];
  if (v > 0 && (!last || num(last.value) !== v)) {
    history.push({ date: todayISO(), value: v });
  }
  return history;
}

// ---- routes ----------------------------------------------------------------
// Editing a property is a page of its own (#/p/<id>), not an overlay: the
// dashboard stays a clean, readable ledger, and back / refresh / a shared link
// all land where you expect.
function parseHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  if (raw === 'new') return { name: 'new' };
  const m = raw.match(/^p\/(.+)$/);
  if (m) return { name: 'property', id: decodeURIComponent(m[1]) };
  return { name: 'list' };
}

const hashFor = (r) =>
  r.name === 'new'
    ? '#/new'
    : r.name === 'property'
      ? `#/p/${encodeURIComponent(r.id)}`
      : '#/';

const routeKey = (r) => (r.name === 'property' ? `p:${r.id}` : r.name);

function emptyForm() {
  const base = {};
  BASE_COSTS.forEach(([k]) => {
    base[k] = '';
  });
  return {
    street: '',
    city: '',
    state: '',
    zip: '',
    rent: '',
    base,
    extras: [],
    mgmtType: 'ziprent',
    feeMode: 'pct',
    feeVal: '8',
    payment: 'Ziprent direct deposit',
    purchasePrice: '',
    purchaseDate: '',
    value: '',
    valueSource: null,
    financing: { downPct: '20', ratePct: '', termYears: '30' },
    meta: null,
  };
}

function formFrom(p) {
  const base = {};
  BASE_COSTS.forEach(([k]) => {
    base[k] = p.base[k] ? String(p.base[k]) : '';
  });
  const fin = p.financing || {};
  return {
    street: p.street,
    city: p.city,
    state: p.state || '',
    zip: p.zip,
    rent: String(p.rent),
    base,
    extras: (p.extras || []).map((x) => ({ label: x.label, amount: String(x.amount) })),
    mgmtType: p.mgmt.type,
    feeMode: p.mgmt.feeMode,
    feeVal: String(p.mgmt.feeVal),
    payment: p.mgmt.payment,
    purchasePrice: p.purchasePrice ? String(p.purchasePrice) : '',
    purchaseDate: p.purchaseDate || '',
    value: p.value ? String(p.value) : '',
    valueSource: p.valueSource || null,
    financing: {
      downPct: fin.downPct != null ? String(fin.downPct) : '20',
      ratePct: fin.ratePct != null ? String(fin.ratePct) : '',
      termYears: fin.termYears != null ? String(fin.termYears) : '30',
    },
    meta: p.meta || null,
  };
}

export default function App({ authMode, accountId = null, onShowLanding } = {}) {
  // Cached list for THIS account only. A new account starts empty — no demo
  // data to delete before the dashboard means anything.
  const [list, setList] = useState(() => loadList(accountId) ?? []);
  const [expanded, setExpanded] = useState(null);
  const [sortBy, setSortBy] = useState('net');
  const [filter, setFilter] = useState('all');
  const [edit, setEdit] = useState({ key: null, val: '' });
  const [route, setRoute] = useState(parseHash);
  const [sync, setSync] = useState(null); // null=local-only | 'syncing' | 'synced' | 'error'
  const [syncError, setSyncError] = useState('');
  const [booted, setBooted] = useState(false);
  const [reminderOff, setReminderOff] = useState(false);

  const routeRef = useRef(route);
  routeRef.current = route;
  // The open form reports whether it holds unsaved edits, so navigating away
  // (back button included) can ask before throwing them out.
  const dirtyRef = useRef(false);

  const remoteOn = useRef(false);
  // Writes stay blocked until a successful read. Pushing before we know what
  // the server holds risks overwriting the real list with a stale local copy.
  const canWrite = useRef(false);
  const skipEcho = useRef(false);
  const pushTimer = useRef(null);
  const rolledRef = useRef(false);
  const liveRef = useRef(true);

  const hydrate = () => {
    setSync('syncing');
    setSyncError('');
    return loadRemote().then((r) => {
      if (!liveRef.current) return;
      remoteOn.current = r.configured;
      setBooted(true);

      if (!r.configured) {
        // No server store on this deployment — localStorage only, by design.
        canWrite.current = false;
        setSync(null);
        return;
      }

      if (!r.ok) {
        // The store exists but would not answer. Do NOT fall back to local-only
        // silently: keep writes blocked and say so, so nothing is lost and
        // nothing stale gets pushed over good data.
        canWrite.current = false;
        setSync('error');
        setSyncError(r.error || 'could not reach the server');
        return;
      }

      canWrite.current = true;
      if (r.properties) {
        skipEcho.current = true;
        setList(r.properties);
        saveList(accountId, r.properties);
        setSync('synced');
      } else {
        // Store is empty — seed it from whatever this browser has cached.
        saveRemote(list).then((res) => {
          if (!liveRef.current) return;
          setSync(res.ok ? 'synced' : 'error');
          if (!res.ok) setSyncError(res.error);
        });
      }
    });
  };

  // Hydrate from the server store once, if one is configured.
  useEffect(() => {
    liveRef.current = true;
    hydrate();
    return () => {
      liveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leaveGuard = () =>
    !dirtyRef.current ||
    window.confirm('Discard your changes to this property?');

  // Hash routing. Guard the one destructive transition: leaving a dirty form —
  // the browser's back button included.
  useEffect(() => {
    const onHash = () => {
      const next = parseHash();
      const prev = routeRef.current;
      if (routeKey(next) === routeKey(prev)) return;
      if (!leaveGuard()) {
        // Put the URL back. That fires this handler again, where the route now
        // matches and the check above returns early.
        window.location.hash = hashFor(prev);
        return;
      }
      dirtyRef.current = false;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A new page starts at the top, not wherever the ledger was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey(route)]);

  // Move now, then write the URL. Waiting for the hashchange event to come back
  // means a frame rendered against the new list but the old route — which, right
  // after deleting a property, flashed "that property isn't here".
  const navigate = (r) => {
    if (routeKey(r) === routeKey(routeRef.current)) return;
    if (!leaveGuard()) return;
    dirtyRef.current = false;
    routeRef.current = r; // the hashchange this triggers is now a no-op
    setRoute(r);
    const h = hashFor(r);
    if (window.location.hash !== h) window.location.hash = h;
  };

  // Persist every change: localStorage always, server store (debounced) when
  // we have successfully read from it.
  useEffect(() => {
    saveList(accountId, list);
    if (!remoteOn.current || !canWrite.current) return;
    if (skipEcho.current) {
      skipEcho.current = false;
      return;
    }
    setSync('syncing');
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      const res = await saveRemote(list);
      if (!liveRef.current) return;
      setSync(res.ok ? 'synced' : 'error');
      setSyncError(res.ok ? '' : res.error);
    }, 800);
  }, [list]);

  const mutate = (fn) => setList((cur) => fn(cur.slice()));

  /** Append a value point when the number actually moved. */
  const pushValue = (p, value) => {
    const hist = Array.isArray(p.valueHistory) ? p.valueHistory : [];
    const last = hist[hist.length - 1];
    const changed = !last || num(last.value) !== value;
    return changed ? hist.concat([{ date: todayISO(), value }]) : hist;
  };

  // Monthly value refresh, in two passes.
  //
  // First the free one: any value we estimated ourselves off the FHFA index
  // gets re-indexed against the current table (which moves when hpi.js is
  // regenerated). No key, no network, so it runs on every deployment.
  //
  // Then the paid one, only where a lookup API is configured: a value-only AVM
  // call per property, best effort, gently paced.
  const refreshValues = async (props) => {
    mutate((l) =>
      l.map((p) => {
        if (p.valueSource !== 'hpi') return p;
        const est = estimateValueFromPurchase(p);
        if (!est || est.value === num(p.value)) return p;
        return { ...p, value: est.value, valueHistory: pushValue(p, est.value) };
      })
    );

    let caps;
    try {
      caps = await getCapabilities();
    } catch {
      return;
    }
    if (!caps.propertyLookup) return;

    for (const p of props) {
      if (!p.street || !(p.zip || p.city)) continue;
      try {
        const d = await lookupProperty(
          { street: p.street, city: p.city, state: p.state, zip: p.zip },
          { fields: 'value' }
        );
        const v = Number(d?.value);
        if (!Number.isFinite(v) || v <= 0) continue;
        mutate((l) =>
          l.map((q) =>
            q.id === p.id
              ? { ...q, value: v, valueSource: 'avm', valueHistory: pushValue(q, v) }
              : q
          )
        );
      } catch {
        /* address not covered / API error — leave this property as-is */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  };

  // Month rollover: once the real list is loaded, if the calendar month has
  // changed since last visit — snapshot each property's net into prevNet so the
  // trend compares against last month, and re-fetch current values. reviewedMonth
  // / rentPaidMonth are month-keyed, so they lapse on their own.
  useEffect(() => {
    if (!booted || rolledRef.current) return;
    rolledRef.current = true;
    let last = null;
    try {
      last = localStorage.getItem(monthKey(accountId));
    } catch {
      /* ignore */
    }
    const cur = currentYM();
    const isNewMonth = Boolean(last) && last !== cur;
    try {
      localStorage.setItem(monthKey(accountId), cur);
    } catch {
      /* ignore */
    }
    if (!isNewMonth) return;

    mutate((l) => l.map((p) => ({ ...p, prevNet: netIncome(p) })));
    refreshValues(list);
  }, [booted]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAllReviewed = () => {
    const ym = currentYM();
    mutate((l) =>
      l.map((p) => (p.reviewedMonth === ym ? p : { ...p, reviewedMonth: ym }))
    );
  };

  // ---- inline ledger editing --------------------------------------------------
  const startEdit = (key, cur) => setEdit({ key, val: String(cur) });
  const changeEdit = (val) => setEdit((e) => ({ ...e, val }));
  const cancelEdit = () => setEdit({ key: null, val: '' });
  const commitEdit = () => {
    if (!edit.key) return;
    const val = num(edit.val);
    const [id, kind, sub] = edit.key.split(':');
    mutate((l) =>
      l.map((p) => {
        if (p.id !== id) return p;
        const q = JSON.parse(JSON.stringify(p));
        if (kind === 'rent') q.rent = val;
        else if (kind === 'b') q.base[sub] = val;
        else if (kind === 'x') q.extras[Number(sub)].amount = val;
        else if (kind === 'fee') q.mgmt.feeVal = val;
        else if (kind === 'value') {
          q.value = val;
          q.valueSource = 'manual';
          const hist = Array.isArray(q.valueHistory) ? q.valueHistory : [];
          const last = hist[hist.length - 1];
          if (val > 0 && (!last || num(last.value) !== val)) {
            q.valueHistory = hist.concat([{ date: todayISO(), value: val }]);
          }
        }
        q.updatedAt = Date.now();
        return q;
      })
    );
    setEdit({ key: null, val: '' });
  };

  // ---- card actions ---------------------------------------------------------
  const toggleExpand = (id) => setExpanded((e) => (e === id ? null : id));

  const removeProperty = (p) => {
    if (!window.confirm(`Delete ${p.street}?`)) return;
    dirtyRef.current = false;
    mutate((l) => l.filter((q) => q.id !== p.id));
    setExpanded((e) => (e === p.id ? null : e));
    const r = routeRef.current;
    if (r.name === 'property' && r.id === p.id) navigate({ name: 'list' });
  };

  const toggleReviewed = (p) => {
    const ym = currentYM();
    mutate((l) =>
      l.map((q) =>
        q.id === p.id ? { ...q, reviewedMonth: q.reviewedMonth === ym ? null : ym } : q
      )
    );
  };

  const toggleRentPaid = (p) => {
    const ym = currentYM();
    mutate((l) =>
      l.map((q) =>
        q.id === p.id ? { ...q, rentPaidMonth: q.rentPaidMonth === ym ? null : ym } : q
      )
    );
  };

  // ---- property page ------------------------------------------------------
  const openAdd = () => navigate({ name: 'new' });
  const openEdit = (p) => navigate({ name: 'property', id: p.id });
  const backToList = () => navigate({ name: 'list' });

  const handleSave = (fields) => {
    dirtyRef.current = false;
    const editingId = routeRef.current.name === 'property' ? routeRef.current.id : null;
    if (editingId) {
      mutate((l) =>
        l.map((p) =>
          p.id === editingId
            ? { ...p, ...fields, valueHistory: withValueHistory(p, fields) }
            : p
        )
      );
    } else {
      const created = {
        ...fields,
        id: uid(),
        prevNet: null,
        reviewedMonth: null,
        rentPaidMonth: null,
        valueHistory: withValueHistory(null, fields),
      };
      mutate((l) => l.concat([created]));
      setExpanded(created.id);
    }
    backToList();
  };

  // ---- derived -----------------------------------------------------------
  const shown = useMemo(() => {
    const filtered = list.filter((p) => filter === 'all' || p.mgmt.type === filter);
    return filtered.slice().sort((a, b) => {
      if (sortBy === 'net') return netIncome(b) - netIncome(a);
      if (sortBy === 'address') return a.street.localeCompare(b.street);
      if (sortBy === 'value') return num(b.value) - num(a.value);
      if (sortBy === 'appreciation') return appreciationPct(b) - appreciationPct(a);
      return b.updatedAt - a.updatedAt;
    });
  }, [list, filter, sortBy]);

  // Baseline for whatever form is open: captured when the page opens, so edits
  // made elsewhere (an inline card edit, a monthly value refresh) can't quietly
  // move the "unsaved changes" goalposts underneath it.
  const routeForm = useMemo(() => {
    if (route.name === 'new') return emptyForm();
    if (route.name === 'property') {
      const p = list.find((q) => q.id === route.id);
      return p ? formFrom(p) : null;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey(route), booted]);

  const isEmpty = list.length === 0;
  const noMatches = list.length > 0 && shown.length === 0;

  const monthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const needReview = list.filter((p) => p.reviewedMonth !== currentYM()).length;
  const showReminder = booted && !reminderOff && needReview > 0;

  // ---- a single property, on its own page ---------------------------------
  if (route.name === 'new' || route.name === 'property') {
    const editing =
      route.name === 'property' ? list.find((p) => p.id === route.id) : null;
    const ready = route.name === 'new' ? Boolean(routeForm) : Boolean(editing && routeForm);

    return (
      <div className="ledger-page">
        <div className="ledger-shell">
          {ready ? (
            <PropertyPage
              key={routeKey(route)}
              mode={route.name === 'new' ? 'add' : 'edit'}
              property={editing}
              initialForm={routeForm}
              onBack={backToList}
              onSave={handleSave}
              onDelete={() => removeProperty(editing)}
              onReview={() => toggleReviewed(editing)}
              onRentPaid={() => toggleRentPaid(editing)}
              onDirtyChange={(d) => {
                dirtyRef.current = d;
              }}
            />
          ) : (
            <div className="prop-page">
              <button type="button" className="page-back" onClick={backToList}>
                <span>←</span> Back to ledger
              </button>
              <div className="empty-state">
                {booted ? (
                  <>
                    <div className="empty-title">That property isn't here.</div>
                    <div className="empty-sub">
                      It may have been deleted, or the link belongs to another
                      account.
                    </div>
                    <button className="btn-primary" onClick={backToList}>
                      Back to the ledger
                    </button>
                  </>
                ) : (
                  <div className="empty-sub">Loading…</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ledger-page">
      <div className="ledger-shell">
        <Header
          monthLabel={monthLabel.toLowerCase()}
          onAdd={openAdd}
          sync={sync}
          showAccount={authMode === 'firebase'}
          onShowLanding={onShowLanding}
        />
        <SummaryBar list={list} />
        <SortFilterBar
          sortBy={sortBy}
          onSort={setSortBy}
          filter={filter}
          onFilter={setFilter}
        />

        {sync === 'error' && (
          <div className="sync-bar">
            <span>
              <strong>Not saving to the server.</strong> Your changes are safe in
              this browser, but they are not syncing
              {syncError ? ` — ${syncError}` : ''}. Avoid editing on another
              device until this clears.
            </span>
            <span className="spacer" />
            <button className="link-btn" onClick={hydrate}>
              Retry
            </button>
          </div>
        )}

        {showReminder && (
          <div className="reminder-bar">
            <span>
              🗓 {monthLabel} — {needReview}{' '}
              {needReview === 1 ? 'property needs' : 'properties need'} a review.
              Update rent &amp; costs so net income stays current.
            </span>
            <span className="spacer" />
            <button className="link-btn" onClick={markAllReviewed}>
              Mark all reviewed
            </button>
            <button className="link-btn" onClick={() => setReminderOff(true)}>
              Dismiss
            </button>
          </div>
        )}

        {isEmpty && (
          <div className="empty-state">
            <div className="empty-title">The ledger is empty.</div>
            <div className="empty-sub">
              Add your first rental to start tracking net income.
            </div>
            <button className="btn-primary" onClick={openAdd}>
              + Add property
            </button>
          </div>
        )}

        {noMatches && (
          <div className="no-matches">No properties match this filter.</div>
        )}

        {!isEmpty && (
          <div className="card-grid">
            {shown.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                monthUpper={monthLabel.toUpperCase()}
                expanded={expanded === p.id}
                edit={edit}
                onToggle={() => toggleExpand(p.id)}
                onEdit={() => openEdit(p)}
                onDelete={() => removeProperty(p)}
                onReview={() => toggleReviewed(p)}
                onRentPaid={() => toggleRentPaid(p)}
                onStartEdit={startEdit}
                onChangeEdit={changeEdit}
                onCommitEdit={commitEdit}
                onCancelEdit={cancelEdit}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
