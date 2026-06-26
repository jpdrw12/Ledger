import React, { useState } from "react";
import { Plus, Trash2, Check, ChevronDown, ChevronRight, ArrowRightCircle, ArrowUp, ArrowDown, Zap, Hand, PiggyBank, TrendingUp, Landmark, Search, Receipt } from "lucide-react";
import * as db from "../lib/db.js";
import { money, computeDueDate } from "../lib/calc.js";
import { Field, AccountSelect, DateInput, parseNumberInput } from "./Shared.jsx";
import { useToast } from "./Toast.jsx";

// Local YYYY-MM-DD (matches how due dates are stored/compared).
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function MonthsTab({
  months,
  ledger,
  accounts,
  bills,
  goals,
  goalBalances,
  debts,
  existingTags,
  openMonth,
  setOpenMonth,
  onChanged,
  onAddMonth,
  onCopyForward,
  onReorder,
}) {
  const { confirm } = useToast();
  const [filter, setFilter] = useState("");

  const trimmed = filter.trim().toLowerCase();
  const visibleMonths = trimmed
    ? months.filter((m) =>
        [...m.expensesPay1, ...m.expensesPay2].some(
          (e) =>
            e.category?.toLowerCase().includes(trimmed) ||
            e.tag?.toLowerCase().includes(trimmed)
        )
      )
    : months;

  return (
    <div className="section">
      <div className="section-head">
        <h2>Months</h2>
        <button className="btn-primary" onClick={onAddMonth}>
          <Plus size={15} /> Add next month
        </button>
      </div>

      <div className="month-filter">
        <Search size={14} />
        <input
          className="month-filter-input"
          placeholder="Filter by expense category or tag…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {trimmed && (
          <button className="icon-btn" onClick={() => setFilter("")} title="Clear filter">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {months.length === 0 && (
        <p className="empty">No months yet. Add one to start the chain — both pays land here together, and every account's balance carries forward automatically.</p>
      )}

      {trimmed && visibleMonths.length === 0 && (
        <p className="empty">No months contain expenses matching "{filter}".</p>
      )}

      <div className="stub-row">
        {visibleMonths.map((m) => (
          <MonthStub
            key={m.id}
            month={m}
            computed={ledger[m.id]}
            index={months.indexOf(m)}
            isOpen={openMonth === m.id}
            onToggle={() => setOpenMonth(openMonth === m.id ? null : m.id)}
            onChanged={onChanged}
            onRemove={async () => {
              if (!(await confirm(`Delete "${m.monthLabel}" and all its bills, expenses, contributions, and debt payments? This can't be undone.`, { danger: true, confirmLabel: "Delete" }))) return;
              await db.deleteMonth(m.id);
              onChanged();
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
          />
        ))}
      </div>
    </div>
  );
}

// Self-contained pay block: income + bills for this slot + expenses for this slot + additions.
function PayBlock({ label, slot, pay, billPayments, bills, expenseList, existingTags, accounts, onChanged,
  onAddBillPayment, onUpdateBillPayment, onRemoveBillPayment, onAddExpense, onUpdateExpense, onRemoveExpense }) {

  const [open, setOpen] = useState(false);
  const additionsTotal = pay.additions.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const incomeTotal = (Number(pay.income) || 0) + additionsTotal;

  const addAddition = async () => {
    await db.addAddition(pay.payBlockId, { name: "Extra pay", amount: 0, accountId: accounts[0]?.id });
    onChanged();
  };
  const updateAddition = async (a, patch) => {
    await db.updateAddition(a.id, { name: a.name, amount: a.amount, accountId: a.accountId, ...patch });
    onChanged();
  };
  const removeAddition = async (id) => {
    await db.deleteAddition(id);
    onChanged();
  };

  const slotBills = (type) =>
    billPayments.filter((bp) => {
      const bill = bills.find((b) => b.id === bp.billId);
      return bill && bill.defaultSlot === slot && (bill.paymentType || "manual") === type;
    });

  const slotQuickAddBills = bills.filter((b) => b.defaultSlot === slot);

  const renderBillRow = (bp) => {
    const bill = bills.find((b) => b.id === bp.billId);
    const overdue = !bp.paid && bp.dueDate && bp.dueDate < localToday();
    return (
      <div className="ledger-row" key={bp.id}>
        <button className="check" onClick={() => onUpdateBillPayment(bp, { paid: !bp.paid })}>
          {bp.paid ? <Check size={13} /> : null}
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
      <div className="grid-2">
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
            <div className="scroll-panel">
              <div className="scroll-panel-label"><Zap size={11} /> Autopay</div>
              {autoBills.map(renderBillRow)}
            </div>
          )}
          {manualBills.length > 0 && (
            <div className="scroll-panel" style={{ marginTop: autoBills.length > 0 ? 6 : 0 }}>
              <div className="scroll-panel-label"><Hand size={11} /> Manual</div>
              {manualBills.map(renderBillRow)}
            </div>
          )}
          {autoBills.length === 0 && manualBills.length === 0 && (
            <div className="scroll-panel">
              <p className="empty small scroll-panel-empty">No bills assigned.</p>
            </div>
          )}
          {slotQuickAddBills.length > 0 && (
            <div className="quick-add">
              {slotQuickAddBills.map((b) => (
                <button key={b.id} className="chip" onClick={() => onAddBillPayment(b)}>
                  {b.paymentType === "auto" ? <Zap size={11} /> : <Hand size={11} />} {b.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <h5 className="sub-title"><Receipt size={12} /> Expenses</h5>
      <div className="scroll-panel">
        {expenseList.map((e) => (
          <div className="ledger-row" key={e.id}>
            <input className="text-input" placeholder="Category (Groceries, Gas…)" defaultValue={e.category} onBlur={(ev) => onUpdateExpense(e, { category: ev.target.value })} />
            <input className="text-input tag-input" placeholder="Tag" list="tag-suggestions" defaultValue={e.tag || ""} onBlur={(ev) => onUpdateExpense(e, { tag: ev.target.value })} />
            <AccountSelect accounts={accounts} value={e.accountId} onChange={(v) => onUpdateExpense(e, { accountId: v })} />
            <input className="amount-input" type="number" defaultValue={e.amount} onBlur={(ev) => onUpdateExpense(e, { amount: parseNumberInput(ev, e.amount) })} />
            <button className="icon-btn" onClick={() => onRemoveExpense(e.id)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {expenseList.length === 0 && <p className="empty small scroll-panel-empty">No expenses logged yet.</p>}
      </div>
      <button className="btn-secondary" onClick={() => onAddExpense(slot)}>
        <Plus size={13} /> Add expense
      </button>

      <h5 className="sub-title"><TrendingUp size={12} /> Additions (extra pay, credit, bonus…)</h5>
      <div className="scroll-panel">
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
      </div>
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
        <button className="btn-apply-debt" onClick={handleApply} title="Apply payment + interest to debt balance">
          Apply
        </button>
      )}
      <button className="icon-btn" onClick={() => onRemove(dp.id)}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function MonthStub({ month, computed, index, isOpen, onToggle, onChanged, onRemove, onCopyForward, onReorder, canReorder, isFirst, isLast, accounts, bills, goals, goalBalances, debts, existingTags }) {
  if (!computed) return null;
  const { byAccount, totalIncome, totalAdditions, totalBills, totalExpensesPay1, totalExpensesPay2, totalGoals, totalDebtPayments, consolidatedCarryOut } = computed;
  const deficit = consolidatedCarryOut < 0;
  const totalExpenses = totalExpensesPay1 + totalExpensesPay2;
  const outstandingBills = month.billPayments.reduce((s, bp) => s + (bp.paid ? 0 : Number(bp.amountPaid) || 0), 0);
  // Due dates auto-fill only when the month label parses as "MonthName Year".
  // A custom label (e.g. "House Move") silently leaves them blank.
  const dueDatesWontFill = computeDueDate(month.monthLabel, 1) === "";

  const addBillPayment = async (bill) => {
    await db.addBillPayment(month.id, {
      billId: bill.id,
      amountPaid: bill.defaultAmount,
      accountId: accounts[0]?.id,
      dueDate: computeDueDate(month.monthLabel, bill.dueDay),
    });
    onChanged();
  };
  const updateBillPayment = async (bp, patch) => {
    await db.updateBillPayment(bp.id, { amountPaid: bp.amountPaid, paid: bp.paid, accountId: bp.accountId, dueDate: bp.dueDate, ...patch });
    onChanged();
  };
  const removeBillPayment = async (id) => {
    await db.deleteBillPayment(id);
    onChanged();
  };

  const addExpense = async (slot) => {
    await db.addExpense(month.id, slot, { category: "", amount: 0, tag: "", accountId: accounts[0]?.id });
    onChanged();
  };
  const updateExpense = async (e, patch) => {
    await db.updateExpense(e.id, { category: e.category, amount: e.amount, tag: e.tag, accountId: e.accountId, ...patch });
    onChanged();
  };
  const removeExpense = async (id) => {
    await db.deleteExpense(id);
    onChanged();
  };

  const addGoalContribution = async (goal) => {
    await db.addGoalContribution(month.id, { goalId: goal.id, amount: 0, accountId: accounts[0]?.id });
    onChanged();
  };
  const updateGoalContribution = async (gc, patch) => {
    await db.updateGoalContribution(gc.id, { amount: gc.amount, accountId: gc.accountId, ...patch });
    onChanged();
  };
  const removeGoalContribution = async (id) => {
    await db.deleteGoalContribution(id);
    onChanged();
  };

  const addDebtPayment = async (debt) => {
    await db.addMonthDebtPayment(month.id, { debtId: debt.id, amount: 0, accountId: accounts[0]?.id });
    onChanged();
  };
  const updateDebtPayment = async (dp, patch) => {
    await db.updateMonthDebtPayment(dp.id, { amount: dp.amount, accountId: dp.accountId, ...patch });
    onChanged();
  };
  const removeDebtPayment = async (id) => {
    await db.deleteMonthDebtPayment(id);
    onChanged();
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

  return (
    <div className={`stub ${isOpen ? "open" : ""}`}>
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
        <button className="icon-btn" title="Copy this bill setup to next month" onClick={(e) => { e.stopPropagation(); onCopyForward(); }}>
          <ArrowRightCircle size={16} />
        </button>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <Trash2 size={15} />
        </button>
      </div>

      {isOpen && (
        <div className="stub-body">
          <div className="per-account-row">
            {accounts.map((a) => (
              <div className="per-account-chip" key={a.id}>
                <span>{a.name}</span>
                <span className={byAccount[a.id].carryOut < 0 ? "deficit mono" : "surplus mono"}>{money(byAccount[a.id].carryOut)}</span>
                <span className="small-label">in {money(byAccount[a.id].carryIn)} → in/out {money(byAccount[a.id].inflow)} / {money(byAccount[a.id].outflow)}</span>
              </div>
            ))}
          </div>

          {dueDatesWontFill && (
            <p className="due-date-hint">
              Due dates won't auto-fill: this month's label isn't a "Month Year" (e.g. "June 2026"), so bills added here need their due dates set by hand.
            </p>
          )}

          <div className="pay-stack">
            <PayBlock
              label="Pay 1" slot={1}
              pay={month.pay1}
              billPayments={month.billPayments}
              bills={bills}
              expenseList={month.expensesPay1}
              existingTags={existingTags}
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
              billPayments={month.billPayments}
              bills={bills}
              expenseList={month.expensesPay2}
              existingTags={existingTags}
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

          <div className="ledger-row totals-row">
            <span>Total income (Pay 1 + Pay 2)</span>
            <span className="mono">{money(totalIncome)}</span>
          </div>
          <div className="ledger-row totals-row">
            <span>Total alt income (all additions)</span>
            <span className="mono">{money(totalAdditions)}</span>
          </div>

          <h4 className="block-title"><PiggyBank size={13} /> Savings contributions <span className="block-hint">— use a negative amount to record a withdrawal</span></h4>
          <div className="scroll-panel">
            {(month.goalContributions || []).map((gc) => {
              const goal = goals.find((g) => g.id === gc.goalId);
              const isWithdrawal = Number(gc.amount) < 0;
              return (
                <div className="ledger-row" key={gc.id}>
                  <span className="row-name">{goal ? goal.name : "Unknown goal"}{isWithdrawal && <span className="withdrawal-pill">withdrawal</span>}</span>
                  <span className="mono small-label">balance: {money(goalBalances[gc.goalId])}</span>
                  <AccountSelect accounts={accounts} value={gc.accountId} onChange={(v) => updateGoalContribution(gc, { accountId: v })} />
                  <input className="amount-input" type="number" defaultValue={gc.amount} onBlur={(ev) => updateGoalContribution(gc, { amount: parseNumberInput(ev, gc.amount) })} />
                  <button className="icon-btn" onClick={() => removeGoalContribution(gc.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
            {(month.goalContributions || []).length === 0 && <p className="empty small scroll-panel-empty">No contributions logged yet.</p>}
          </div>
          <div className="quick-add">
            <span>Quick add:</span>
            {goals.map((g) => (
              <button key={g.id} className="chip" onClick={() => addGoalContribution(g)}>
                {g.name}
              </button>
            ))}
          </div>

          <h4 className="block-title"><Landmark size={13} /> Debt payments</h4>
          <div className="scroll-panel">
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
          </div>
          <div className="quick-add">
            <span>Quick add:</span>
            {debts.map((d) => (
              <button key={d.id} className="chip" onClick={() => addDebtPayment(d)}>
                {d.name}
              </button>
            ))}
          </div>

          <div className="sticky-totals">
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
          </div>
        </div>
      )}
    </div>
  );
}
