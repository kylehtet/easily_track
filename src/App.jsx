import { useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import SummaryBar from './components/SummaryBar.jsx';
import SortFilterBar from './components/SortFilterBar.jsx';
import PropertyCard from './components/PropertyCard.jsx';
import PropertyModal from './components/PropertyModal.jsx';
import { BASE_COSTS, netIncome, num, appreciationPct } from './lib/calculations.js';
import { loadList, saveList } from './lib/storage.js';
import { loadRemote, saveRemote } from './lib/remoteStore.js';
import { seedProperties } from './data/sampleProperties.js';
import { uid } from './lib/id.js';

const currentYM = () => new Date().toISOString().slice(0, 7);
const todayISO = () => new Date().toISOString().slice(0, 10);

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
    financing: {
      downPct: fin.downPct != null ? String(fin.downPct) : '20',
      ratePct: fin.ratePct != null ? String(fin.ratePct) : '',
      termYears: fin.termYears != null ? String(fin.termYears) : '30',
    },
    meta: p.meta || null,
  };
}

export default function App() {
  const [list, setList] = useState(() => loadList() ?? seedProperties());
  const [expanded, setExpanded] = useState(null);
  const [sortBy, setSortBy] = useState('net');
  const [filter, setFilter] = useState('all');
  const [edit, setEdit] = useState({ key: null, val: '' });
  const [modal, setModal] = useState(null); // { id: string | null, form }
  const [sync, setSync] = useState(null); // null=local-only | 'syncing' | 'synced' | 'error'

  const remoteOn = useRef(false);
  const skipEcho = useRef(false);
  const pushTimer = useRef(null);

  // Hydrate from the server store once, if one is configured.
  useEffect(() => {
    let live = true;
    loadRemote().then((r) => {
      if (!live) return;
      remoteOn.current = r.configured;
      if (!r.configured) return;
      if (r.properties) {
        skipEcho.current = true;
        setList(r.properties);
        saveList(r.properties);
        setSync('synced');
      } else {
        // store is empty — seed it from what we have locally
        setSync('syncing');
        saveRemote(list).then((ok) => live && setSync(ok ? 'synced' : 'error'));
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist every change: localStorage always, server store (debounced) when on.
  useEffect(() => {
    saveList(list);
    if (!remoteOn.current) return;
    if (skipEcho.current) {
      skipEcho.current = false;
      return;
    }
    setSync('syncing');
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      const ok = await saveRemote(list);
      setSync(ok ? 'synced' : 'error');
    }, 800);
  }, [list]);

  const mutate = (fn) => setList((cur) => fn(cur.slice()));

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
    mutate((l) => l.filter((q) => q.id !== p.id));
    setExpanded((e) => (e === p.id ? null : e));
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

  // ---- modal --------------------------------------------------------------
  const openAdd = () => setModal({ id: null, form: emptyForm() });
  const openEdit = (p) => setModal({ id: p.id, form: formFrom(p) });
  const closeModal = () => setModal(null);

  const handleSave = (fields) => {
    if (modal.id) {
      mutate((l) =>
        l.map((p) =>
          p.id === modal.id
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
    setModal(null);
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

  const isEmpty = list.length === 0;
  const noMatches = list.length > 0 && shown.length === 0;

  const monthLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="ledger-page">
      <div className="ledger-shell">
        <Header
          monthLabel={monthLabel.toLowerCase()}
          onAdd={openAdd}
          sync={sync}
        />
        <SummaryBar list={list} />
        <SortFilterBar
          sortBy={sortBy}
          onSort={setSortBy}
          filter={filter}
          onFilter={setFilter}
        />

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

      {modal && (
        <PropertyModal
          mode={modal.id ? 'edit' : 'add'}
          initialForm={modal.form}
          onCancel={closeModal}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
