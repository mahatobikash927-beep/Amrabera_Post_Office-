/* =====================================================================
   AMRABERA BRANCH POST OFFICE (723127) – Small Savings Calculator
   ---------------------------------------------------------------------
   1) CONFIG  – edit ONLY this block when a new quarter's rates / rules
                are announced (Department of Posts SB Order).
   2) Calculation functions (pure, no DOM)
   3) Rendering + event handling
   ===================================================================== */

const CONFIG = {
  /* Rates in % per annum. Source: SB Order No. 12/2026 dated 30-09-2026,
     unchanged for Oct–Dec 2026. Verify every quarter. */
  effective: "1 Oct 2026 – 31 Dec 2026",
  rates: { sb: 4.0, rd: 6.7, td: { 1: 6.9, 2: 7.0, 3: 7.1, 5: 7.5 }, ssa: 8.2 },

  /* Scheme rules used by the formulas. */
  rules: {
    rdMonths: 60,           // Post Office RD term (5 years)
    rdCompoundPerYear: 4,   // RD interest compounded quarterly
    tdCompoundPerYear: 4,   // TD interest calculated quarterly, paid annually
    sbCreditEveryMonths: 12,// SB interest credited yearly (simplified model)
    ssa: { min: 250, max: 150000, depositYears: 15, maturityYears: 21, maxAge: 10 },
    minimum: { sb: 500, rd: 100, td: 1000 }
  },
  compareSbYears: 5         // period used for SB in the comparison table
};

/* ---------------- Helpers ---------------- */
const inr = n => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------- Calculations ---------------- */

/* SB: interest at SB rate; credited each completed year (added to balance), part-year pro rata. */
function calcSB(P, months, rate) {
  const r = rate / 100, yrs = Math.floor(months / 12), rem = months % 12;
  let bal = P; const rows = [];
  for (let y = 1; y <= yrs; y++) { const i = bal * r; rows.push([`Year ${y}`, bal, i, bal + i]); bal += i; }
  if (rem) { const i = bal * r * rem / 12; rows.push([`${rem} month(s)`, bal, i, bal + i]); bal += i; }
  return { invested: P, interest: bal - P, total: bal, rows };
}

/* RD: quarterly compounding. Instalment i (start of month i) earns for (n-i+1) months:
   R × (1 + rate/400)^((n-i+1)/3). Balance after month m = sum of these for i=1..m. */
function calcRD(R, n, rate) {
  const q = rate / 100 / CONFIG.rules.rdCompoundPerYear, per = 12 / CONFIG.rules.rdCompoundPerYear;
  const bal = m => { let s = 0; for (let i = 1; i <= m; i++) s += R * Math.pow(1 + q, (m - i + 1) / per); return s; };
  const rows = [];
  for (let m = 12; m <= n; m += 12) rows.push([`Year ${m / 12}`, R * m, bal(m) - R * m, bal(m)]);
  const total = bal(n);
  return { invested: R * n, interest: total - R * n, total, rows };
}

/* TD: annual interest = P × ((1 + r/4)^4 − 1)  (quarterly calculation, paid yearly).
   Paid-out interest does NOT compound inside the TD. If it stays in SB it earns the SB rate. */
function calcTD(P, years, rate, sbRate, includeSB) {
  const q = rate / 100 / CONFIG.rules.tdCompoundPerYear;
  const annual = P * (Math.pow(1 + q, CONFIG.rules.tdCompoundPerYear) - 1);
  let sbBal = 0, sbInt = 0; const rows = [];
  for (let y = 1; y <= years; y++) {
    const open = sbBal, i = includeSB ? open * sbRate / 100 : 0;
    sbBal = open + i + annual; sbInt += i;
    rows.push([`Year ${y}`, annual, open, i, sbBal]);
  }
  const tdInt = annual * years;
  return { P, annual, tdInt, sbInt, benefit: tdInt + sbInt, total: P + tdInt + sbInt, rows };
}

/* SSA: deposit at start of each year (up to depYears, within 15), interest compounded yearly,
   account continues to earn interest until 21 years from opening. */
function calcSSA(A, depYears, rate) {
  const r = rate / 100, N = CONFIG.rules.ssa.maturityYears; let bal = 0, dep = 0; const rows = [];
  for (let y = 1; y <= N; y++) {
    const d = y <= depYears ? A : 0, i = (bal + d) * r;
    bal += d + i; dep += d; rows.push([y, d, i, bal]);
  }
  return { invested: dep, interest: bal - dep, total: bal, rows };
}

/* ---------------- Rendering ---------------- */
const table = (head, rows, fmtFirst = x => x) =>
  `<div class="scroll"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
  rows.map(r => `<tr>${r.map((c, i) => `<td>${i === 0 ? fmtFirst(c) : (typeof c === "number" ? inr(c) : c)}</td>`).join("")}</tr>`).join("") +
  `</tbody></table></div>`;

const big = (a, b, c) => `<div class="big"><div><span>Investment</span><b>${inr(a)}</b></div>
  <div><span>Interest Earned</span><b>${inr(b)}</b></div><div class="total"><span>Maturity / Total Value</span><b>${inr(c)}</b></div></div>`;

const actions = `<div class="btns"><button type="button" class="btn" data-act="reset">Reset</button>
  <button type="button" class="btn" data-act="again">Calculate Again</button>
  <button type="button" class="btn primary" data-act="print">Print Result</button></div>`;

const wrap = html => `<div class="result">${html}${actions}</div>`;

/* ---------------- Form handlers ---------------- */
const handlers = {
  sb(f) {
    const P = +f.amount.value, m = +f.months.value, rate = CONFIG.rates.sb;
    if (!(P >= CONFIG.rules.minimum.sb)) return `Minimum balance is ${inr(CONFIG.rules.minimum.sb)}.`;
    if (!(m >= 1)) return "Please enter the period in months.";
    const r = calcSB(P, m, rate);
    return wrap(big(r.invested, r.interest, r.total) +
      table(["Particular", "Amount"], [["Principal", P], ["Interest", r.interest], ["Maturity / Total Amount", r.total]]) +
      `<p class="how">Rate ${rate}% p.a. for ${m} month(s). Interest of each completed year is added to the balance; a part year is pro-rata. Real SB interest is based on the minimum balance between the 10th and month-end, so actual figures can differ.</p>` +
      (r.rows.length ? table(["Period", "Opening", "Interest", "Closing"], r.rows) : ""));
  },
  rd(f) {
    const R = +f.amount.value, n = CONFIG.rules.rdMonths, rate = CONFIG.rates.rd;
    if (!(R >= CONFIG.rules.minimum.rd)) return `Minimum monthly deposit is ${inr(CONFIG.rules.minimum.rd)}.`;
    const r = calcRD(R, n, rate);
    return wrap(big(r.invested, r.interest, r.total) +
      table(["Particular", "Amount"], [["Monthly Deposit", R], ["Total Deposit", r.invested], ["Interest Earned", r.interest], ["Maturity Amount", r.total]]) +
      `<p class="how">Quarterly compounding at ${rate}% p.a. Each instalment i earns for (${n} − i + 1) months: R × (1 + ${rate}/400)^(months/3). Table shows balance after each year (instalments assumed paid on time).</p>` +
      table(["Year", "Deposited", "Interest", "Balance"], r.rows));
  },
  td(f) {
    const P = +f.amount.value, y = +f.years.value, rate = CONFIG.rates.td[y], inc = f.sbint.checked;
    if (!(P >= CONFIG.rules.minimum.td)) return `Minimum deposit is ${inr(CONFIG.rules.minimum.td)}.`;
    const r = calcTD(P, y, rate, CONFIG.rates.sb, inc);
    return wrap(big(P, r.benefit, r.total) +
      table(["Particular", "Amount"], [["TD Principal", P], ["TD Interest", r.tdInt], ["Interest transferred to SB", r.tdInt],
        ["Additional SB Interest", r.sbInt], ["Total Interest Benefit", r.benefit], ["Final / Total Amount", r.total]]) +
      `<p class="how"><b>Method:</b> TD rate ${rate}% p.a. is calculated quarterly (${(rate / 4).toFixed(4)}% per quarter) and paid yearly: yearly TD interest = P × ((1 + ${rate}/400)^4 − 1) = ${inr(r.annual)}. Paid-out interest does not compound inside the TD. ` +
      (inc ? `Each yearly credit is assumed to stay in SB and earn ${CONFIG.rates.sb}% p.a. until the TD ends.` : "SB interest on the credited amount is not included.") + `</p>` +
      table(["Year", "TD interest credited", "SB opening", "SB interest", "SB closing"], r.rows));
  },
  ssa(f) {
    const S = CONFIG.rules.ssa, A = +f.amount.value, d = +f.depYears.value, age = +f.age.value;
    if (age > S.maxAge || age < 0) return `Account can be opened for a girl up to ${S.maxAge} years of age.`;
    if (A < S.min || A > S.max) return `Annual deposit must be between ${inr(S.min)} and ${inr(S.max)}.`;
    if (!(d >= 1 && d <= S.depositYears)) return `Deposit period must be 1 to ${S.depositYears} years.`;
    const r = calcSSA(A, d, CONFIG.rates.ssa);
    return wrap(big(r.invested, r.interest, r.total) +
      table(["Particular", "Amount"], [["Total Deposits", r.invested], ["Estimated Interest", r.interest], ["Maturity Value", r.total]]) +
      `<p class="how">Maturity ${S.maturityYears} years after opening (girl's age then: ${age + S.maturityYears}). Deposit assumed at the start of each year; interest ${CONFIG.rates.ssa}% compounded yearly; no deposits after year ${d}, but interest continues.</p>` +
      table(["Year", "Deposit", "Interest", "Closing Balance"], r.rows, x => x));
  },
  cmp(f) {
    const A = +f.amount.value, R = CONFIG.rates, S = CONFIG.rules.ssa;
    if (!(A > 0)) return "Please enter an amount.";
    const rows = [], add = (n, inv, i, t, note) => rows.push([n, inv, i, t, note]);
    const sb = calcSB(A, CONFIG.compareSbYears * 12, R.sb); add("SB", A, sb.interest, sb.total, `Lump sum, ${CONFIG.compareSbYears} yrs, ${R.sb}%, withdrawable`);
    const rd = calcRD(A, CONFIG.rules.rdMonths, R.rd); add("RD", rd.invested, rd.interest, rd.total, `${inr(A)} per month, 5 yrs, ${R.rd}%`);
    [1, 2, 3, 5].forEach(y => { const t = calcTD(A, y, R.td[y], R.sb, true); add(`TD ${y}Y`, A, t.benefit, t.total, `Lump sum, ${R.td[y]}%, incl. SB interest on yearly interest`); });
    const a = Math.min(A, S.max), s = calcSSA(a, S.depositYears, R.ssa);
    add("SSA", s.invested, s.interest, s.total, `${inr(a)} per year × ${S.depositYears} yrs, ${R.ssa}%, matures in ${S.maturityYears} yrs`);
    return `<div class="result">${table(["Scheme", "Invested", "Interest", "Total Value", "Basis"], rows)}
      <p class="how">Figures are estimates; schemes differ in tenure, deposit type and rules, so compare the basis column too.</p></div>`;
  }
};

function run(form) {
  const key = form.dataset.calc, box = form.parentElement;
  const out = $(".out", box), err = $(".err", box);
  const res = handlers[key](form.elements);
  const bad = !res.startsWith("<");
  err.textContent = bad ? res : ""; out.innerHTML = bad ? "" : res;
  if (!bad) out.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.addEventListener("submit", e => { e.preventDefault(); run(e.target); });
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const box = b.closest(".card"), form = $("form", box);
  if (b.dataset.act === "print") window.print();
  if (b.dataset.act === "again") { run(form); }
  if (b.dataset.act === "reset") { form.reset(); $(".out", box).innerHTML = ""; $(".err", box).textContent = ""; form.scrollIntoView({ block: "center" }); }
});

/* Tabs */
$$(".tabs [role=tab]").forEach(t => t.addEventListener("click", () => {
  $$(".tabs [role=tab]").forEach(x => x.setAttribute("aria-selected", x === t));
  $$(".panel").forEach(p => p.hidden = p.id !== "p-" + t.dataset.tab);
}));

/* Static content driven by CONFIG */
$("#rateEffective").textContent = `Rates applicable: ${CONFIG.effective}`;
$("#rdPeriod").value = `${CONFIG.rules.rdMonths} months (5 years)`;
const S = CONFIG.rules.ssa;
$("#ssaRules").textContent = `SSA rules: account for a girl child up to ${S.maxAge} years old; deposits ${inr(S.min)} to ${inr(S.max)} per financial year for up to ${S.depositYears} years from opening; account matures ${S.maturityYears} years from opening; interest is compounded yearly at the rate notified quarterly. Please confirm details with the post office.`;
const cards = [["SB", CONFIG.rates.sb], ["RD", CONFIG.rates.rd], ...[1, 2, 3, 5].map(y => [`TD ${y} Year`, CONFIG.rates.td[y]]), ["SSA", CONFIG.rates.ssa]];
$("#rateCards").innerHTML = cards.map(([n, r]) => `<div>${n}<b>${r.toFixed(1)}%</b>p.a.</div>`).join("");
