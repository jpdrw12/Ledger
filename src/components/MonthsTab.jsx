import React, { useState } from "react";
import { Plus, Trash2, Check, ChevronDown, ChevronRight, ArrowRightCircle, ArrowUp, ArrowDown, Zap, Hand, PiggyBank, TrendingUp, Landmark, Search, Receipt, Upload, Download, ArrowLeftRight, ArrowRight } from "lucide-react";
import * as db from "../lib/db.js";
import { money, computeDueDate, dueDayForSlot, parseExpensesCsv, planTransfer } from "../lib/calc.js";
import { importTextFile, exportTextFile } from "../lib/backup.js";
import { Field, AccountSelect, EndpointSelect, endpointValue, parseEndpoint, DateInput, parseNumberInput, MonthSection, ScrollPanel, Collapsible } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";
import { undoableDelete } from "../lib/undo.js";

// Local YYYY-MM-DD (matches how due dates are stored/compared).
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function MonthsTab({
  months,
  ledger,
  accounts,
  bills,
  goals,
  goalBalances,
  debts,
  existingTags,
  existingCategories,
  existingNotes,
  openMonth,
  setOpenMonth,
  onChanged,
  onPatch,
  onAddMonth,
  onCopyForward,
  onReorder,
  forceOpenPay1,
}) {
  const { confirm, toast } = useToast();
  const [filter, setFilter] = useState("");

  const trimmed = filter.trim().toLowerCase();
  // Search across everything visible in a month, not just expenses: the month
  // label, expense categories/tags, bill names, goal/debt names on their
  // contributions/payments, transfer notes, and addition names.
  const monthMatches = (m) => {
    const hay = [
      m.monthLabel,
      ...[...m.expensesPay1, ...m.expensesPay2].flatMap((e) => [e.category, e.tag]),
      ...m.billPayments.map((bp) => bills.find((b) => b.id === bp.billId)?.name),
      ...m.goalContributions.map((gc) => goals.find((g) => g.id === gc.goalId)?.name),
      ...m.debtPayments.map((dp) => debts.find((d) => d.id === dp.debtId)?.name),
      ...m.transfers.map((t) => t.note),
      ...[m.pay1, m.pay2].flatMap((p) => p.additions.map((a) => a.name)),
    ];
    return hay.some((s) => s && s.toLowerCase().includes(trimmed));
  };
  const visibleMonths = trimmed ? months.filter(monthMatches) : months;

  return (
    <div className="section">
      <div className="section-head">
        <h2>Months</h2>
        <button className="btn-primary" onClick={onAddMonth} data-tour="add-month">
          <Plus size={15} /> Add next month
        </button>
      </div>

      <div className="month-filter">
        <Search size={14} />
        <input
          id="month-search-input"
          className="month-filter-input"
          placeholder="Search months — bills, expenses, goals, transfers, notes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {trimmed && (
          <button className="icon-btn" onClick={() => setFilter("")} title="Clear filter">
            <Trash2 size={13} />
          </button>
        )}
        {months.length > 1 && (
          <select
            className="account-select"
            value=""
            title="Jump to a month"
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              setOpenMonth(id);
              requestAnimationFrame(() =>
                document.getElementById(`month-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
              );
            }}
          >
            <option value="">Jump to…</option>
            {months.map((m) => (
              <option key={m.id} value={m.id}>{m.monthLabel}</option>
            ))}
          </select>
        )}
      </div>

      {months.length === 0 && (
        <p className="empty">No months yet. Add one to start the chain — both pays land here together, and every account's balance carries forward automatically.</p>
      )}

      {trimmed && visibleMonths.length === 0 && (
        <p className="empty">No months match "{filter}".</p>
      )}

      <div className="stub-row" data-tour="month">
        {visibleMonths.map((m) => (
          <MonthStub
            key={m.id}
            month={m}
            forceOpenPay1={forceOpenPay1}
            computed={ledger[m.id]}
            index={months.indexOf(m)}
            isOpen={openMonth === m.id}
            onToggle={() => setOpenMonth(openMonth === m.id ? null : m.id)}
            onChanged={onChanged}
            onPatch={onPatch}
            onRemove={async () => {
              if (!(await confirm(`Delete "${m.monthLabel}" and all its bills, expenses, contributions, and debt payments?`, { danger: true, confirmLabel: "Delete" }))) return;
              await undoableDelete({
                label: `Month "${m.monthLabel}"`,
                doDelete: () => db.deleteMonth(m.id),
                doRestore: () => db.restoreMonth(m),
                onChanged, toast,
              });
            }}
            onCopyForward={() => onCopyForward(m)}
            onReorder={onReorder}
            canReorder={!trimmed}
            isFirst={months.indexOf(m) === 0}
            isLast={months.indexOf(m) === months.length - 1}
            accounts={accounts}
            bills={bills}
            goals={goals}
            goalBalances={goalBalances}
            debts={debts}
            existingTags={existingTags}
            existingCategories={existingCategories}
            existingNotes={existingNotes}
          />
        ))}
      </div>
    </div>
  );
}

// Self-contained pay block: income + bills for this slot + expenses for this slot + additions.
function PayBlock({ label, slot, pay, monthId, onPatch, forceOpen, billPayments, bills, expenseList, existingTags, existingCategories, accounts, onChanged,
  onAddBillPayment, onUpdateBillPayment, onRemoveBillPayment, onAddExpense, onUpdateExpense, onRemoveExpense }) {

  const [open, setOpen] = useState(!!forceOpen);
  const { toast } = useToast();
  const additionsTotal = pay.additions.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const incomeTotal = (Number(pay.income) || 0) + additionsTotal;

  const addAddition = async () => {
    await db.addAddition(pay.payBlockId, { name: "Extra pay", amount: 0, accountId: accounts[0]?.id });
    onChanged();
  };
  const updateAddition = async (a, patch) => {
    onPatch?.((s) => patchAddition(s, monthId, slot, a.id, patch));
    await db.updateAddition(a.id, { name: a.name, amount: a.amount, accountId: a.accountId, ...patch });
    onChanged();
  };
  const removeAddition = async (id) => {
    const a = pay.additions.find((x) => x.id === id);
    await undoableDelete({
      label: `Addition "${a?.name || "row"}"`,
      doDelete: () => db.deleteAddition(id),
      doRestore: () => db.restoreAddition(pay.payBlockId, a),
      onChanged, toast,
    });
  };

  const slotBills = (type) =>
    billPayments.filter((bp) => {
      const bill = bills.find((b) => b.id === bp.billId);
      return bill && (bp.slot || 1) === slot && (bill.paymentType || "manual") === type;
    });

  const slotQuickAddBills = bills.filter((b) => (slot === 1 ? b.addToSlot1 : b.addToSlot2));

  // Card (excluded-account) spending lives in the Card tab, so keep it out of
  // this pay block: hide card expenses and don't offer card accounts for new ones.
  const cardIds = new Set(accounts.filter((a) => a.excludeFromTotal).map((a) => a.id));
  const nonCardAccounts = accounts.filter((a) => !a.excludeFromTotal);
  const mainExpenses = expenseList.filter((e) => !cardIds.has(e.accountId));

  const renderBillRow = (bp) => {
    const bill = bills.find((b) => b.id === bp.billId);
    const overdue = !bp.paid && bp.dueDate && bp.dueDate < localToday();
    return (
      <div className="ledger-row" key={bp.id}>
        <button data-tour="bill-paid" className={`check ${bp.paid ? "checked" : ""}`} title={bp.paid ? "Paid" : "Mark paid"} onClick={() => onUpdateBillPayment(bp, { paid: !bp.paid })}>
          {bp.paid ? <Check size={18} strokeWidth={3.5} /> : null}
        </button>
        <span className="row-name">
          {bill ? bill.name : "Unknown bill"}
          {overdue && <span className="overdue-pill">overdue</span>}
        </span>
        <DateInput className="date-input" defaultValue={bp.dueDate} onSave={(v) => onUpdateBillPayment(bp, { dueDate: v })} />
        <AccountSelect accounts={accounts} value={bp.accountId} onChange={(v) => onUpdateBillPayment(bp, { accountId: v })} />
        <input
          className="amount-input"
          type="number"
          defaultValue={bp.amountPaid}
          onBlur={(e) => onUpdateBillPayment(bp, { amountPaid: parseNumberInput(e, bp.amountPaid) })}
        />
        <button className="icon-btn" onClick={() => onRemoveBillPayment(bp.id)}>
          <Trash2 size={13} />
        </button>
      </div>
    );
  };

  const autoBills = slotBills("auto");
  const manualBills = slotBills("manual");

  return (
    <div className="pay-block">
      <div className="pay-block-head" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="pay-block-label">{label}</span>
        <span className="mono pay-block-total">{money(incomeTotal)}</span>
      </div>
      {!open && null}
      {open && <div className="pay-block-body">
      <div className="grid-2" data-tour="income">
        <Field
          label="Income"
          type="number"
          defaultValue={pay.income}
          onBlur={async (e) => {
            await db.updatePayBlock(pay.payBlockId, { income: parseNumberInput(e, pay.income), incomeAccountId: pay.incomeAccountId });
            onChanged();
          }}
        />
        <div className="field">
          <span>Deposits to</span>
          <AccountSelect
            accounts={accounts}
            value={pay.incomeAccountId}
            onChange={async (v) => {
              await db.updatePayBlock(pay.payBlockId, { income: pay.income, incomeAccountId: v });
              onChanged();
            }}
          />
        </div>
      </div>

      {(autoBills.length > 0 || manualBills.length > 0 || slotQuickAddBills.length > 0) && (
        <>
          <h5 className="sub-title"><Receipt size={12} /> Bills</h5>
          {autoBills.length > 0 && (
            <ScrollPanel>
              <div className="scroll-panel-label"><Zap size={11} /> Autopay</div>
              {autoBills.map(renderBillRow)}
            </ScrollPanel>
          )}
          {manualBills.length > 0 && (
            <ScrollPanel style={{ marginTop: autoBills.length > 0 ? 6 : 0 }}>
              <div className="scroll-panel-label"><Hand size={11} /> Manual</div>
              {manualBills.map(renderBillRow)}
            </ScrollPanel>
          )}
          {autoBills.length === 0 && manualBills.length === 0 && (
            <ScrollPanel>
              <p className="empty small scroll-panel-empty">No bills assigned.</p>
            </ScrollPanel>
          )}
          {slotQuickAddBills.length > 0 && (
            <div className="quick-add">
              {slotQuickAddBills.map((b) => (
                <button key={b.id} className="chip" onClick={() => onAddBillPayment(b, slot)}>
                  {b.paymentType === "auto" ? <Zap size={11} /> : <Hand size={11} />} {b.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <h5 className="sub-title"><Receipt size={12} /> Expenses</h5>
      <ScrollPanel>
        {mainExpenses.map((e) => (
          <div className="ledger-row" key={e.id}>
            <input className="text-input" placeholder="Category (Groceries, Gas…)" list="category-suggestions" defaultValue={e.category} onBlur={(ev) => onUpdateExpense(e, { category: ev.target.value })} />
            <input className="text-input tag-input" placeholder="Tag" list="tag-suggestions" defaultValue={e.tag || ""} onBlur={(ev) => onUpdateExpense(e, { tag: ev.target.value })} />
            <AccountSelect accounts={nonCardAccounts} value={e.accountId} onChange={(v) => onUpdateExpense(e, { accountId: v })} />
            <input className="amount-input" type="number" defaultValue={e.amount} onBlur={(ev) => onUpdateExpense(e, { amount: parseNumberInput(ev, e.amount) })} />
            <button className="icon-btn" onClick={() => onRemoveExpense(e.id)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {mainExpenses.length === 0 && <p className="empty small scroll-panel-empty">No expenses logged yet.</p>}
      </ScrollPanel>
      <button className="btn-secondary" data-tour="add-expense" onClick={() => onAddExpense(slot)}>
        <Plus size={13} /> Add expense
      </button>

      <h5 className="sub-title"><TrendingUp size={12} /> Additions (extra pay, credit, bonus…)</h5>
      <ScrollPanel>
        {pay.additions.map((a) => (
          <div className="ledger-row" key={a.id}>
            <input className="text-input" defaultValue={a.name} onBlur={(e) => updateAddition(a, { name: e.target.value })} />
            <AccountSelect accounts={accounts} value={a.accountId} onChange={(v) => updateAddition(a, { accountId: v })} />
            <input
              className="amount-input"
              type="number"
              defaultValue={a.amount}
              onBlur={(e) => updateAddition(a, { amount: parseNumberInput(e, a.amount) })}
            />
            <button className="icon-btn" onClick={() => removeAddition(a.id)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {pay.additions.length === 0 && <p className="empty small scroll-panel-empty">No additions yet.</p>}
      </ScrollPanel>
      <button className="btn-secondary" onClick={addAddition}>
        <Plus size={13} /> Add addition
      </button>
      {pay.additions.length > 0 && (
        <div className="ledger-row totals-row">
          <span>Additions total</span>
          <span className="mono">{money(additionsTotal)}</span>
        </div>
      )}
      </div>}
    </div>
  );
}

function DebtPaymentRow({ dp, debt, accounts, onUpdate, onRemove, onApply }) {
  const [amount, setAmount] = useState(dp.amount);

  const save = async (val) => {
    await onUpdate(dp, { amount: val });
  };

  const handleApply = async () => {
    await onApply({ ...dp, amount });
  };

  return (
    <div className="ledger-row">
      <span className="row-name">{debt ? debt.name : "Unknown debt"}</span>
      <AccountSelect accounts={accounts} value={dp.accountId} onChange={(v) => onUpdate(dp, { accountId: v })} />
      <input
        className="amount-input"
        type="number"
        value={amount}
        disabled={dp.applied}
        onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
        onBlur={() => save(amount)}
      />
      {dp.applied ? (
        <span className="debt-applied-badge"><Check size={11} /> Applied</span>
      ) : (
        <button className="btn-apply-debt" onClick={handleApply} title="Apply this payment to the debt balance (interest is charged once per month on the Debts tab)">
          Apply
        </button>
      )}
      <button className="icon-btn" onClick={() => onRemove(dp.id)}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// Immutably patch one row (matched by id) inside the given month's collections.
// `keys` lists which arrays on the month might hold the row (expenses live in
// two slot arrays, so both are searched).
function patchMonthRow(state, monthId, rowId, patch, keys) {
  return {
    ...state,
    months: state.months.map((m) => {
      if (m.id !== monthId) return m;
      const next = { ...m };
      for (const k of keys) {
        if (next[k]?.some((r) => r.id === rowId)) {
          next[k] = next[k].map((r) => (r.id === rowId ? { ...r, ...patch } : r));
        }
      }
      return next;
    }),
  };
}

// Immutably patch one addition (matched by id) inside a month's pay block.
function patchAddition(state, monthId, slot, addId, patch) {
  const key = slot === 1 ? "pay1" : "pay2";
  return {
    ...state,
    months: state.months.map((m) => {
      if (m.id !== monthId) return m;
      const block = m[key];
      return { ...m, [key]: { ...block, additions: block.additions.map((a) => (a.id === addId ? { ...a, ...patch } : a)) } };
    }),
  };
}

function MonthStub({ month, computed, index, isOpen, onToggle, onChanged, onPatch, onRemove, onCopyForward, onReorder, canReorder, isFirst, isLast, accounts, bills, goals, goalBalances, debts, existingTags, existingCategories, existingNotes, forceOpenPay1 }) {
  const { toast } = useToast();
  if (!computed) return null;
  const { byAccount, totalIncome, totalAdditions, totalBills, totalExpensesPay1, totalExpensesPay2, totalGoals, totalDebtPayments, consolidatedCarryOut } = computed;
  const deficit = consolidatedCarryOut < 0;
  const totalExpenses = totalExpensesPay1 + totalExpensesPay2;
  const outstandingBills = month.billPayments.reduce((s, bp) => s + (bp.paid ? 0 : Number(bp.amountPaid) || 0), 0);
  // Due dates auto-fill only when the month label parses as "MonthName Year".
  // A custom label (e.g. "House Move") silently leaves them blank.
  const dueDatesWontFill = computeDueDate(month.monthLabel, 1) === "";

  const addBillPayment = async (bill, slot) => {
    await db.addBillPayment(month.id, {
      billId: bill.id,
      amountPaid: bill.defaultAmount,
      accountId: accounts[0]?.id,
      dueDate: computeDueDate(month.monthLabel, dueDayForSlot(bill, slot)),
      slot,
    });
    onChanged();
  };
  const updateBillPayment = async (bp, patch) => {
    onPatch((s) => patchMonthRow(s, month.id, bp.id, patch, ["billPayments"]));
    await db.updateBillPayment(bp.id, { amountPaid: bp.amountPaid, paid: bp.paid, accountId: bp.accountId, dueDate: bp.dueDate, ...patch });
    onChanged();
  };
  const removeBillPayment = async (id) => {
    const bp = (month.billPayments || []).find((x) => x.id === id);
    const bill = bills.find((b) => b.id === bp?.billId);
    await undoableDelete({
      label: `Bill "${bill?.name || "payment"}"`,
      doDelete: () => db.deleteBillPayment(id),
      doRestore: () => db.restoreBillPayment(month.id, bp),
      onChanged, toast,
    });
  };

  const addExpense = async (slot) => {
    // Default to a main (non-card) account — card spending is added in the Card tab.
    const defaultAccount = accounts.find((a) => !a.excludeFromTotal) || accounts[0];
    await db.addExpense(month.id, slot, { category: "", amount: 0, tag: "", accountId: defaultAccount?.id });
    onChanged();
  };
  const importExpenses = async () => {
    try {
      const text = await importTextFile();
      if (text == null) return;
      const rows = parseExpensesCsv(text);
      if (!rows.length) {
        toast("No expense rows found in that file.", "error");
        return;
      }
      for (const r of rows) {
        await db.addExpense(month.id, 1, { category: r.category, amount: r.amount, tag: r.tag, accountId: accounts[0]?.id });
      }
      onChanged();
      toast(`Imported ${rows.length} expense${rows.length === 1 ? "" : "s"} into ${month.monthLabel} (Pay 1).`, "success");
    } catch (e) {
      toast(`Import failed: ${e}`, "error");
    }
  };
  const exportTemplate = async () => {
    // A ready-to-fill template matching parseExpensesCsv's expected columns
    // (Category, Amount, Tag), with a couple of example rows.
    const csv = "Category,Amount,Tag\nGroceries,85.00,weekly\nGas,40.00,\n";
    try {
      const path = await exportTextFile("expenses-template.csv", csv);
      if (path) toast(`Template saved to ${path}`, "success");
    } catch (e) {
      toast(`Export failed: ${e}`, "error");
    }
  };
  const updateExpense = async (e, patch) => {
    onPatch((s) => patchMonthRow(s, month.id, e.id, patch, ["expensesPay1", "expensesPay2"]));
    await db.updateExpense(e.id, { category: e.category, amount: e.amount, tag: e.tag, accountId: e.accountId, ...patch });
    onChanged();
  };
  const removeExpense = async (id) => {
    const inP1 = (month.expensesPay1 || []).find((x) => x.id === id);
    const e = inP1 || (month.expensesPay2 || []).find((x) => x.id === id);
    const slot = inP1 ? 1 : 2;
    await undoableDelete({
      label: `Expense "${e?.category || "row"}"`,
      doDelete: () => db.deleteExpense(id),
      doRestore: () => db.restoreExpense(month.id, slot, e),
      onChanged, toast,
    });
  };

  const addGoalContribution = async (goal) => {
    await db.addGoalContribution(month.id, { goalId: goal.id, amount: 0, accountId: accounts[0]?.id });
    onChanged();
  };
  const addGoalInterest = async (goal) => {
    // Interest/dividend: raises the goal balance, no account involved.
    await db.addGoalContribution(month.id, { goalId: goal.id, amount: 0, accountId: null, kind: "interest" });
    onChanged();
  };
  const updateGoalContribution = async (gc, patch) => {
    onPatch((s) => patchMonthRow(s, month.id, gc.id, patch, ["goalContributions"]));
    await db.updateGoalContribution(gc.id, { amount: gc.amount, accountId: gc.accountId, ...patch });
    onChanged();
  };
  const removeGoalContribution = async (id) => {
    const gc = (month.goalContributions || []).find((x) => x.id === id);
    const goal = goals.find((g) => g.id === gc?.goalId);
    await undoableDelete({
      label: `${gc?.kind === "interest" ? "Interest for" : "Contribution to"} "${goal?.name || "goal"}"`,
      doDelete: () => db.deleteGoalContribution(id),
      doRestore: () => db.restoreGoalContribution(month.id, gc),
      onChanged, toast,
    });
  };

  const addDebtPayment = async (debt) => {
    await db.addMonthDebtPayment(month.id, { debtId: debt.id, amount: 0, accountId: accounts[0]?.id });
    onChanged();
  };
  const updateDebtPayment = async (dp, patch) => {
    onPatch((s) => patchMonthRow(s, month.id, dp.id, patch, ["debtPayments"]));
    await db.updateMonthDebtPayment(dp.id, { amount: dp.amount, accountId: dp.accountId, ...patch });
    onChanged();
  };
  const removeDebtPayment = async (id) => {
    const dp = (month.debtPayments || []).find((x) => x.id === id);
    const debt = debts.find((d) => d.id === dp?.debtId);
    await undoableDelete({
      label: `Payment to "${debt?.name || "debt"}"`,
      doDelete: () => db.deleteMonthDebtPayment(id),
      doRestore: () => db.restoreDebtPayment(month.id, dp),
      onChanged, toast,
    });
  };
  const applyDebtPayment = async (dp) => {
    const debt = debts.find((d) => d.id === dp.debtId);
    if (!debt) return;
    await db.applyMonthDebtPayment(dp.id, {
      debtId: dp.debtId,
      amount: dp.amount,
      monthLabel: month.monthLabel,
      currentBalance: debt.balance,
      apr: debt.apr,
    });
    onChanged();
  };

  // Transfers move money between two like endpoints: account<->account or
  // goal<->goal. Account<->goal moves are Savings contributions, handled in the
  // Savings section, not here. A transfer stores either account or goal columns.
  const transferCols = (plan) =>
    plan.type === "goal-transfer"
      ? { fromAccountId: null, toAccountId: null, fromGoalId: plan.fromGoalId, toGoalId: plan.toGoalId }
      : { fromAccountId: plan.fromAccountId, toAccountId: plan.toAccountId, fromGoalId: null, toGoalId: null };

  // First same-kind endpoint other than `excludeId` — used to keep both sides
  // the same kind when one side's kind changes.
  const defaultEndpoint = (kind, excludeId) => {
    const list = kind === "goal" ? goals : accounts;
    const pick = list.find((x) => x.id !== excludeId) || list[0];
    return pick ? { kind, id: pick.id } : null;
  };

  const addTransfer = async () => {
    let plan = null;
    if (accounts.length >= 2) {
      plan = planTransfer({ kind: "account", id: accounts[0].id }, { kind: "account", id: accounts[1].id }, 0);
    } else if (goals.length >= 2) {
      plan = planTransfer({ kind: "goal", id: goals[0].id }, { kind: "goal", id: goals[1].id }, 0);
    }
    if (!plan || plan.type === "invalid") return;
    await db.addTransfer(month.id, { ...transferCols(plan), amount: plan.amount, note: "" });
    onChanged();
  };

  const saveTransferRow = async (row, patch) => {
    const from = patch.from ?? row.from;
    const to = patch.to ?? row.to;
    const amount = patch.amount ?? row.amount;
    const note = patch.note ?? row.note;
    const plan = planTransfer(from, to, amount);
    if (plan.type === "invalid") {
      if (plan.reason === "same") toast("Pick two different accounts or goals.", "error");
      else if (plan.reason === "mixed") toast("To move between an account and a savings goal, use Savings contributions.", "error");
      onChanged(); // revert the dropdown to the stored value
      return;
    }
    await db.updateTransfer(row.id, { ...transferCols(plan), amount: plan.amount, note });
    onChanged();
  };
  const removeTransferRow = async (row) => {
    const t = (month.transfers || []).find((x) => x.id === row.id);
    await undoableDelete({
      label: "Transfer",
      doDelete: () => db.deleteTransfer(row.id),
      doRestore: () => db.restoreTransfer(month.id, t),
      onChanged, toast,
    });
  };

  // Account<->account and goal<->goal transfers (account<->goal lives in Savings).
  const transferRows = (month.transfers || []).map((t) => ({
    id: t.id,
    from: t.fromGoalId ? { kind: "goal", id: t.fromGoalId } : { kind: "account", id: t.fromAccountId },
    to: t.toGoalId ? { kind: "goal", id: t.toGoalId } : { kind: "account", id: t.toAccountId },
    amount: t.amount, note: t.note,
  }));

  const renderTransferRow = (row) => {
    // Both sides must be the same kind; the "to" list is filtered to match the
    // "from" kind, and changing "from"'s kind resets "to" to a matching one.
    const toAccounts = row.from.kind === "account" ? accounts : [];
    const toGoals = row.from.kind === "goal" ? goals : [];
    return (
      <div className="ledger-row transfer-row" key={`${row.id}-${row.amount}-${row.from.kind}:${row.from.id}-${row.to.kind}:${row.to.id}`}>
        <EndpointSelect
          accounts={accounts} goals={goals}
          value={endpointValue(row.from.kind, row.from.id)}
          onChange={(v) => {
            const nf = parseEndpoint(v);
            const patch = { from: nf };
            if (nf.kind !== row.to.kind) patch.to = defaultEndpoint(nf.kind, nf.id);
            saveTransferRow(row, patch);
          }}
        />
        <ArrowRight size={13} className="transfer-arrow" />
        <EndpointSelect accounts={toAccounts} goals={toGoals} value={endpointValue(row.to.kind, row.to.id)} onChange={(v) => saveTransferRow(row, { to: parseEndpoint(v) })} />
        <input className="text-input tag-input" placeholder="Note" list="transfer-note-suggestions" defaultValue={row.note || ""} onBlur={(ev) => saveTransferRow(row, { note: ev.target.value })} />
        <input className="amount-input" type="number" defaultValue={row.amount} onBlur={(ev) => saveTransferRow(row, { amount: parseNumberInput(ev, row.amount) })} />
        <button className="icon-btn" onClick={() => removeTransferRow(row)}>
          <Trash2 size={13} />
        </button>
      </div>
    );
  };
  const canAddTransfer = accounts.length >= 2 || goals.length >= 2;
  const totalTransfers = (month.transfers || []).reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Group this month's contributions by goal so each goal's balance shows once.
  const contributionGroups = (() => {
    const map = new Map();
    (month.goalContributions || []).forEach((gc) => {
      if (!map.has(gc.goalId)) map.set(gc.goalId, []);
      map.get(gc.goalId).push(gc);
    });
    return [...map.entries()];
  })();

  return (
    <div id={`month-${month.id}`} className={`stub ${isOpen ? "open" : ""}`}>
      <div className="stub-head" onClick={onToggle}>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div className="stub-title">
          <span className="stub-eyebrow">Month {index + 1}</span>
          <input
            className="month-title-input"
            defaultValue={month.monthLabel}
            onClick={(e) => e.stopPropagation()}
            onBlur={async (e) => {
              const next = e.target.value.trim();
              if (next && next !== month.monthLabel) {
                await db.renameMonth(month.id, next);
                onChanged();
              }
            }}
          />
        </div>
        <div className="stub-summary">
          <span className="stub-summary-chip">Bills {money(totalBills)}</span>
          <span className="stub-summary-chip">Exp {money(totalExpenses)}</span>
        </div>
        <div className="stub-balance">
          <span className="stub-label">excl. unpaid bills</span>
          <span className={`amount ${consolidatedCarryOut + outstandingBills < 0 ? "deficit" : "surplus"}`}>{money(consolidatedCarryOut + outstandingBills)}</span>
        </div>
        <div className="stub-balance">
          <span className="stub-label">consolidated, carries to next month</span>
          <span className={`amount ${deficit ? "deficit" : "surplus"}`}>{money(consolidatedCarryOut)}</span>
        </div>
        {canReorder && (
          <>
            <button className="icon-btn" title="Move earlier" disabled={isFirst} onClick={(e) => { e.stopPropagation(); onReorder(month, "up"); }}>
              <ArrowUp size={15} />
            </button>
            <button className="icon-btn" title="Move later" disabled={isLast} onClick={(e) => { e.stopPropagation(); onReorder(month, "down"); }}>
              <ArrowDown size={15} />
            </button>
          </>
        )}
        <button className="icon-btn" data-tour="copy-forward" title="Copy this bill setup to next month" onClick={(e) => { e.stopPropagation(); onCopyForward(); }}>
          <ArrowRightCircle size={16} />
        </button>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <Trash2 size={15} />
        </button>
      </div>

      {isOpen && (
        <div className="stub-body">
          <div className="month-summary" data-tour="month-summary">
            <div className="ms-cell"><span className="ms-label">Income</span><span className="ms-val mono">{money(totalIncome + totalAdditions)}</span></div>
            <div className="ms-cell"><span className="ms-label">Bills</span><span className="ms-val mono">{money(totalBills)}</span></div>
            <div className="ms-cell"><span className="ms-label">Outstanding</span><span className={`ms-val mono ${outstandingBills > 0 ? "deficit" : ""}`}>{money(outstandingBills)}</span></div>
            <div className="ms-cell"><span className="ms-label">Expenses</span><span className="ms-val mono">{money(totalExpenses)}</span></div>
            <div className="ms-cell ms-end"><span className="ms-label">Ending</span><span className={`ms-val mono ${deficit ? "deficit" : "surplus"}`}>{money(consolidatedCarryOut)}</span></div>
          </div>

          <Collapsible title="Per-account detail">
          <div className="per-account-row">
            {accounts.map((a) => {
              const unpaid = (month.billPayments || []).reduce(
                (s, bp) => s + (!bp.paid && bp.accountId === a.id ? Number(bp.amountPaid) || 0 : 0),
                0
              );
              const exclUnpaid = byAccount[a.id].carryOut + unpaid;
              return (
                <div className="per-account-chip" key={a.id}>
                  <span>{a.name}{a.excludeFromTotal && <span className="excluded-tag">not in total</span>}</span>
                  <span className={byAccount[a.id].carryOut < 0 ? "deficit mono" : "surplus mono"}>{money(byAccount[a.id].carryOut)}</span>
                  {unpaid > 0 && (
                    <span className={`small-label mono ${exclUnpaid < 0 ? "deficit" : "surplus"}`}>{money(exclUnpaid)} excl. unpaid bills</span>
                  )}
                  <span className="small-label">in {money(byAccount[a.id].carryIn)} → in/out {money(byAccount[a.id].inflow)} / {money(byAccount[a.id].outflow)}</span>
                </div>
              );
            })}
          </div>
          </Collapsible>

          {dueDatesWontFill && (
            <p className="due-date-hint">
              Due dates won't auto-fill: this month's label isn't a "Month Year" (e.g. "June 2026"), so bills added here need their due dates set by hand.
            </p>
          )}

          <div className="month-toolbar">
            <button className="btn-secondary" onClick={importExpenses} title="Import expenses from a CSV (Category, Amount, Tag) into Pay 1">
              <Upload size={13} /> Import expenses CSV
            </button>
            <button className="btn-secondary" onClick={exportTemplate} title="Download a blank CSV formatted for the Import expenses button">
              <Download size={13} /> Export template
            </button>
          </div>

          <div className="pay-stack">
            <PayBlock
              label="Pay 1" slot={1}
              pay={month.pay1}
              monthId={month.id}
              onPatch={onPatch}
              forceOpen={forceOpenPay1}
              billPayments={month.billPayments}
              bills={bills}
              expenseList={month.expensesPay1}
              existingTags={existingTags}
              existingCategories={existingCategories}
              accounts={accounts}
              onChanged={onChanged}
              onAddBillPayment={addBillPayment}
              onUpdateBillPayment={updateBillPayment}
              onRemoveBillPayment={removeBillPayment}
              onAddExpense={addExpense}
              onUpdateExpense={updateExpense}
              onRemoveExpense={removeExpense}
            />
            <PayBlock
              label="Pay 2" slot={2}
              pay={month.pay2}
              monthId={month.id}
              onPatch={onPatch}
              billPayments={month.billPayments}
              bills={bills}
              expenseList={month.expensesPay2}
              existingTags={existingTags}
              existingCategories={existingCategories}
              accounts={accounts}
              onChanged={onChanged}
              onAddBillPayment={addBillPayment}
              onUpdateBillPayment={updateBillPayment}
              onRemoveBillPayment={removeBillPayment}
              onAddExpense={addExpense}
              onUpdateExpense={updateExpense}
              onRemoveExpense={removeExpense}
            />
          </div>
          <datalist id="tag-suggestions">
            {existingTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <datalist id="category-suggestions">
            {(existingCategories || []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <MonthSection icon={<PiggyBank size={13} />} title="Savings contributions" hint="Use a negative amount to record a withdrawal. Interest/dividends raise the goal balance without touching an account.">
          <ScrollPanel>
            {contributionGroups.map(([goalId, list]) => {
              const goal = goals.find((g) => g.id === goalId);
              return (
                <div className="goal-group" key={goalId}>
                  <div className="goal-group-head">
                    <span className="row-name">{goal ? goal.name : "Unknown goal"}</span>
                    <span className="mono small-label">balance: {money(goalBalances[goalId])}</span>
                  </div>
                  {list.map((gc) => {
                    const isInterest = gc.kind === "interest";
                    const isWithdrawal = !isInterest && Number(gc.amount) < 0;
                    return (
                      <div className="ledger-row contribution-row" key={`${gc.id}-${gc.amount}-${gc.accountId}-${gc.kind}`}>
                        <span className="row-name">
                          {isInterest && <span className="withdrawal-pill">interest / dividend</span>}
                          {isWithdrawal && <span className="withdrawal-pill">withdrawal</span>}
                        </span>
                        {isInterest ? (
                          <span className="small-label" style={{ opacity: 0.6 }}>no account</span>
                        ) : (
                          <AccountSelect accounts={accounts} value={gc.accountId} onChange={(v) => updateGoalContribution(gc, { accountId: v })} />
                        )}
                        <input className="amount-input" type="number" defaultValue={gc.amount} onBlur={(ev) => updateGoalContribution(gc, { amount: parseNumberInput(ev, gc.amount) })} />
                        <button className="icon-btn" onClick={() => removeGoalContribution(gc.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {contributionGroups.length === 0 && <p className="empty small scroll-panel-empty">No contributions logged yet.</p>}
          </ScrollPanel>
          <div className="quick-add">
            <span>Quick add:</span>
            {goals.map((g) => (
              <button key={g.id} className="chip" onClick={() => addGoalContribution(g)}>
                {g.name}
              </button>
            ))}
          </div>
          {goals.length > 0 && (
            <div className="quick-add">
              <span>Add interest / dividend:</span>
              {goals.map((g) => (
                <button key={g.id} className="chip" onClick={() => addGoalInterest(g)}>
                  {g.name}
                </button>
              ))}
            </div>
          )}
          </MonthSection>

          <MonthSection icon={<Landmark size={13} />} title="Debt payments">
          <ScrollPanel>
            {(month.debtPayments || []).map((dp) => {
              const debt = debts.find((d) => d.id === dp.debtId);
              return (
                <DebtPaymentRow
                  key={`${dp.id}-${dp.amount}-${dp.applied}`}
                  dp={dp}
                  debt={debt}
                  accounts={accounts}
                  onUpdate={updateDebtPayment}
                  onRemove={removeDebtPayment}
                  onApply={applyDebtPayment}
                />
              );
            })}
            {(month.debtPayments || []).length === 0 && <p className="empty small scroll-panel-empty">No debt payments logged yet.</p>}
          </ScrollPanel>
          <div className="quick-add">
            <span>Quick add:</span>
            {debts.map((d) => (
              <button key={d.id} className="chip" onClick={() => addDebtPayment(d)}>
                {d.name}
              </button>
            ))}
          </div>
          </MonthSection>

          <div data-tour="transfers">
          <MonthSection icon={<ArrowLeftRight size={13} />} title="Transfers" hint="Between accounts, or between savings goals (account↔goal is a Savings contribution)." total={totalTransfers}>
          <ScrollPanel>
            {transferRows.map(renderTransferRow)}
            {transferRows.length === 0 && <p className="empty small scroll-panel-empty">No transfers logged yet.</p>}
          </ScrollPanel>
          {canAddTransfer ? (
            <div className="quick-add">
              <button className="chip" onClick={addTransfer}>
                <ArrowLeftRight size={11} /> Add transfer
              </button>
            </div>
          ) : (
            <p className="empty small">Add a second account or a second savings goal to move money between them.</p>
          )}
          <datalist id="transfer-note-suggestions">
            {(existingNotes || []).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          </MonthSection>
          </div>

          <Collapsible title="Full breakdown">
          <div className="sticky-totals">
            <div className="ledger-row totals-row">
              <span>Total income (Pay 1 + Pay 2)</span>
              <span className="mono">{money(totalIncome)}</span>
            </div>
            <div className="ledger-row totals-row">
              <span>Total alt income (all additions)</span>
              <span className="mono">{money(totalAdditions)}</span>
            </div>
            <div className="ledger-row totals-row">
              <span>Bills total</span>
              <span className="mono">{money(totalBills)}</span>
            </div>
            <div className="ledger-row totals-row">
              <span>Outstanding (unpaid bills)</span>
              <span className={`mono ${outstandingBills > 0 ? "deficit" : "surplus"}`}>{money(outstandingBills)}</span>
            </div>
            <div className="ledger-row totals-row">
              <span>Expenses total (Pay 1 + Pay 2)</span>
              <span className="mono">{money(totalExpenses)}</span>
            </div>
            <div className="ledger-row totals-row">
              <span>Savings contributions</span>
              <span className="mono">{money(totalGoals)}</span>
            </div>
            <div className="ledger-row totals-row">
              <span>Debt payments</span>
              <span className="mono">{money(totalDebtPayments)}</span>
            </div>
            <div className="ledger-row totals-row final">
              <span>Consolidated ending balance, carried to next month</span>
              <span className={`mono ${deficit ? "deficit" : "surplus"}`}>{money(consolidatedCarryOut)}</span>
            </div>
            <div className="ledger-row totals-row">
              <span>Ending balance if unpaid bills excluded</span>
              <span className={`mono ${consolidatedCarryOut + outstandingBills < 0 ? "deficit" : "surplus"}`}>{money(consolidatedCarryOut + outstandingBills)}</span>
            </div>
          </div>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

export default React.memo(MonthsTab);
