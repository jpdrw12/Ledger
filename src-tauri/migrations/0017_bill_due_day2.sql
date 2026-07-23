-- A bill that feeds both pay periods can now have a separate due day per period.
-- The existing due_day becomes Pay 1's; due_day2 is Pay 2's. Seed due_day2 from
-- due_day so bills that already feed both keep their current single day until
-- edited. Code falls back to due_day when due_day2 is NULL.
ALTER TABLE bills ADD COLUMN due_day2 INTEGER;
UPDATE bills SET due_day2 = due_day;
