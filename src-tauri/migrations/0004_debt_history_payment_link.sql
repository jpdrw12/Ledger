ALTER TABLE debt_history ADD COLUMN month_debt_payment_id TEXT REFERENCES month_debt_payments(id);
