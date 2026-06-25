import React from "react";
import { Plus, Trash2, Check, ChevronDown, ChevronRight, ArrowRightCircle, Zap, Hand, PiggyBank, TrendingUp } from "lucide-react";
import * as db from "../lib/db.js";
import { money, computeDueDate } from "../lib/calc.js";
import { Field, AccountSelect } from "./Shared.jsx";

export default function MonthsTab({
  months,
  ledger,
  accounts,
  bills,
  goals,
  goalBalances,
  existingTags,
  openMonth,
  setOpenMonth,
  onChanged,
  onAddMonth,
  onCopyForward,
}) {
  return (
    <div className="section">
      <div className="section-head">
        <h2>Months</h2>
        <button className="btn-primary" onClick={onAddMonth}>
          <Plus size={15} /> Add next month
        </button>
      </div>

      {months.length === 0 && (
        <p className="empty">No months yet. Add one to start the chain — both pays land here together, and every account's balance carries forward automatically.</p>
      )}

      <div className="stub-row">
        {months.map((m, i) => (
          <MonthStub
            key={m.id}
            month={m}
            computed={ledger[m.id]}
            index={i}
            isOpen={openMonth === m.id}
            onToggle={() => setOpenMonth(openMonth === m.id ? null : m.id)}
            onChanged={onChanged}
            onRemove={async () => {
              await db.deleteMonth(m.id);
              onChanged();
            }}
            onCopyForward={() => onCopyForward(m)}
            accounts={accounts}
            bills={bills}
            goals={goals}
            goalBalances={goalBalances}
            existingTags={existingTags}
          />
        ))}
      </div>
    </div>
  );
}

function PayBlock({ label, pay, accounts, onChanged }) {
  const additionsTotal = pay.additions.reduce((s, a) => s + (Number(a.amount) || 0), 0);

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

  return (
    <div className="pay-block">
      <h4 className="block-title">{label}</h4>
      <div className="grid-2">
        <Field
          label="Income"
          type="number"
          defaultValue={pay.income}
          onBlur={async (e) => {
            await db.updatePayBlock(pay.payBlockId, { income: parseFloat(e.target.value) || 0, incomeAccountId: pay.incomeAccountId });
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
              onBlur={(e) => updateAddition(a, { amount: parseFloat(e.target.value) || 0 })}
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
      <div className="ledger-row totals-row">
        <span>Additions total (tallies into alt income)</span>
        <span className="mono">{money(additionsTotal)}</span>
      </div>
    </div>
  );
}

function MonthStub({ month, computed, index, isOpen, onToggle, onChanged, onRemove, onCopyForward, accounts, bills, goals, goalBalances, existingTags }) {
  if (!computed) return null;
  const { byAccount, totalIncome, totalAdditions, totalBills, totalExpensesPay1, totalExpensesPay2, totalGoals, consolidatedCarryOut } = computed;
  const deficit = consolidatedCarryOut < 0;

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

  const billsByType = (paymentType) =>
    month.billPayments.filter((bp) => {
      const bill = bills.find((b) => b.id === bp.billId);
      return bill && (bill.paymentType || "manual") === paymentType;
    });

  const renderBillRow = (bp) => {
    const bill = bills.find((b) => b.id === bp.billId);
    return (
      <div className="ledger-row" key={bp.id}>
        <button className="check" onClick={() => updateBillPayment(bp, { paid: !bp.paid })}>
          {bp.paid ? <Check size={13} /> : null}
        </button>
        <span className="row-name">
          {bill ? bill.name : "Unknown bill"}
          {bill && <span className="slot-pill">Pay {bill.defaultSlot}</span>}
        </span>
        <input className="date-input" type="date" defaultValue={bp.dueDate || ""} onBlur={(e) => updateBillPayment(bp, { dueDate: e.target.value })} />
        <AccountSelect accounts={accounts} value={bp.accountId} onChange={(v) => updateBillPayment(bp, { accountId: v })} />
        <input
          className="amount-input"
          type="number"
          defaultValue={bp.amountPaid}
          onBlur={(e) => updateBillPayment(bp, { amountPaid: parseFloat(e.target.value) || 0 })}
        />
        <button className="icon-btn" onClick={() => removeBillPayment(bp.id)}>
          <Trash2 size={13} />
        </button>
      </div>
    );
  };

  const renderExpenseSection = (slot) => {
    const list = slot === 1 ? month.expensesPay1 : month.expensesPay2;
    return (
      <>
        <h4 className="block-title">Expenses — Pay {slot}</h4>
        <div className="scroll-panel">
          {list.map((e) => (
            <div className="ledger-row" key={e.id}>
              <input className="text-input" placeholder="Category (Groceries, Gas…)" defaultValue={e.category} onBlur={(ev) => updateExpense(e, { category: ev.target.value })} />
              <input className="text-input tag-input" placeholder="Tag (MC, JP MC…)" list="tag-suggestions" defaultValue={e.tag || ""} onBlur={(ev) => updateExpense(e, { tag: ev.target.value })} />
              <AccountSelect accounts={accounts} value={e.accountId} onChange={(v) => updateExpense(e, { accountId: v })} />
              <input className="amount-input" type="number" defaultValue={e.amount} onBlur={(ev) => updateExpense(e, { amount: parseFloat(ev.target.value) || 0 })} />
              <button className="icon-btn" onClick={() => removeExpense(e.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {list.length === 0 && <p className="empty small scroll-panel-empty">No expenses logged yet.</p>}
        </div>
        <button className="btn-secondary" onClick={() => addExpense(slot)}>
          <Plus size={13} /> Add expense
        </button>
      </>
    );
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
        <div className="stub-balance">
          <span className="stub-label">consolidated, carries to next month</span>
          <span className={`amount ${deficit ? "deficit" : "surplus"}`}>{money(consolidatedCarryOut)}</span>
        </div>
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

          <div className="pay-grid">
            <PayBlock label="Pay 1" pay={month.pay1} accounts={accounts} onChanged={onChanged} />
            <PayBlock label="Pay 2" pay={month.pay2} accounts={accounts} onChanged={onChanged} />
          </div>

          <div className="ledger-row totals-row">
            <span>Total income (Pay 1 + Pay 2)</span>
            <span className="mono">{money(totalIncome)}</span>
          </div>
          <div className="ledger-row totals-row">
            <span>Total alt income (all additions)</span>
            <span className="mono">{money(totalAdditions)}</span>
          </div>

          <h4 className="block-title"><Zap size={13} /> Autopay bills</h4>
          <div className="scroll-panel">
            {billsByType("auto").length === 0 && <p className="empty small scroll-panel-empty">No autopay bills assigned.</p>}
            {billsByType("auto").map(renderBillRow)}
          </div>

          <h4 className="block-title"><Hand size={13} /> Manually paid bills</h4>
          <div className="scroll-panel">
            {billsByType("manual").length === 0 && <p className="empty small scroll-panel-empty">No manual bills assigned.</p>}
            {billsByType("manual").map(renderBillRow)}
          </div>

          <div className="quick-add">
            <span>Quick add:</span>
            {bills.map((b) => (
              <button key={b.id} className="chip" onClick={() => addBillPayment(b)}>
                {b.paymentType === "auto" ? <Zap size={11} /> : <Hand size={11} />} {b.name}
                <span className="chip-slot">P{b.defaultSlot}</span>
              </button>
            ))}
          </div>

          {renderExpenseSection(1)}
          {renderExpenseSection(2)}
          <datalist id="tag-suggestions">
            {existingTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          <h4 className="block-title"><PiggyBank size={13} /> Savings contributions</h4>
          <div className="scroll-panel">
            {(month.goalContributions || []).map((gc) => {
              const goal = goals.find((g) => g.id === gc.goalId);
              return (
                <div className="ledger-row" key={gc.id}>
                  <span className="row-name">{goal ? goal.name : "Unknown goal"}</span>
                  <span className="mono small-label">balance: {money(goalBalances[gc.goalId])}</span>
                  <AccountSelect accounts={accounts} value={gc.accountId} onChange={(v) => updateGoalContribution(gc, { accountId: v })} />
                  <input className="amount-input" type="number" defaultValue={gc.amount} onBlur={(ev) => updateGoalContribution(gc, { amount: parseFloat(ev.target.value) || 0 })} />
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

          <div className="ledger-row totals-row">
            <span>Bills total</span>
            <span className="mono">{money(totalBills)}</span>
          </div>
          <div className="ledger-row totals-row">
            <span>Expenses total (Pay 1 + Pay 2)</span>
            <span className="mono">{money(totalExpensesPay1 + totalExpensesPay2)}</span>
          </div>
          <div className="ledger-row totals-row">
            <span>Savings contributions</span>
            <span className="mono">{money(totalGoals)}</span>
          </div>
          <div className="ledger-row totals-row final">
            <span>Consolidated ending balance, carried to next month</span>
            <span className={`mono ${deficit ? "deficit" : "surplus"}`}>{money(consolidatedCarryOut)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
