-- Add brokerage_dre column to profiles for PDF report footers.
-- (Brokerage DRE numbers are distinct from individual agent DRE numbers;
-- both appear in standard CA real estate disclosure footers.)

alter table public.profiles
  add column if not exists brokerage_dre text;
