// localStorage store: bookings, calls, ledger, alerts, callbacks. Sirf browser mein rehta hai.
(function (root) {
  const KEY = 'vaanidesk.v1';
  const empty = () => ({ bookings: [], calls: [], ledger: [], alerts: [], callbacks: [] });
  let data = load();
  const subs = [];

  function load() {
    try { return Object.assign(empty(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { return empty(); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage full: ignore */ }
    subs.forEach((f) => f(data));
  }
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function apply(actions) {
    for (const a of actions || []) {
      if (a.type === 'booking_add') data.bookings.push(Object.assign({ id: id(), createdAt: Date.now() }, a.booking));
      else if (a.type === 'booking_move') { const b = data.bookings.find((x) => x.id === a.id); if (b) Object.assign(b, { date: a.date, time: a.time }); }
      else if (a.type === 'booking_cancel') { const b = data.bookings.find((x) => x.id === a.id); if (b) b.status = 'cancelled'; }
      else if (a.type === 'alert_add') data.alerts.push({ id: id(), ts: Date.now(), text: a.text, seen: false });
      else if (a.type === 'callback_add') data.callbacks.push({ id: id(), ts: Date.now(), text: a.text });
      else if (a.type === 'ledger_add') data.ledger.push({ id: id(), ts: Date.now(), name: a.name, amount: a.amount });
      else if (a.type === 'ledger_paid') data.ledger.push({ id: id(), ts: Date.now(), name: a.name, amount: -a.amount });
    }
    save();
  }

  function logTurn(turn) { data.calls.push(Object.assign({ id: id(), ts: Date.now() }, turn)); save(); }
  function dismissAlerts() { data.alerts.forEach((a) => { a.seen = true; }); save(); }
  function reset() { data = empty(); save(); }
  function get() { return data; }
  function subscribe(f) { subs.push(f); }

  function ledgerByName() {
    const map = {};
    for (const e of data.ledger) {
      const k = e.name.toLowerCase();
      map[k] = map[k] || { name: e.name, due: 0, last: 0 };
      map[k].due += e.amount;
      map[k].last = Math.max(map[k].last, e.ts);
    }
    return Object.values(map).sort((a, b) => b.last - a.last);
  }

  // Doosre tab mein badlaav aaye to bhi update ho
  if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) { data = load(); subs.forEach((f) => f(data)); } });

  root.VaaniStore = { get, apply, logTurn, dismissAlerts, reset, subscribe, ledgerByName };
})(window);
