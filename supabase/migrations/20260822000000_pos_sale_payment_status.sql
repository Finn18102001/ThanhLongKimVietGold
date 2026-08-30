-- Sale payment status foundation (spec 14, 46).
-- Transaction status stays independent. Existing COMPLETED sales = fully paid.

alter table public.pos_sales
  add column if not exists payment_status text,
  add column if not exists paid_dong bigint,
  add column if not exists remaining_dong bigint,
  add column if not exists due_date date;

update public.pos_sales
set
  payment_status = coalesce(payment_status, 'PAID'),
  paid_dong = coalesce(paid_dong, total_dong),
  remaining_dong = coalesce(remaining_dong, 0)
where true;

alter table public.pos_sales
  alter column payment_status set default 'PAID',
  alter column payment_status set not null,
  alter column paid_dong set default 0,
  alter column paid_dong set not null,
  alter column remaining_dong set default 0,
  alter column remaining_dong set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sales_payment_status_check'
      and conrelid = 'public.pos_sales'::regclass
  ) then
    alter table public.pos_sales
      add constraint pos_sales_payment_status_check
      check (payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_sales_paid_nonneg_check'
      and conrelid = 'public.pos_sales'::regclass
  ) then
    alter table public.pos_sales
      add constraint pos_sales_paid_nonneg_check
      check (paid_dong >= 0 and remaining_dong >= 0);
  end if;
end;
$$;

create or replace function pos_private.pos_sales_fill_payment_on_total()
returns trigger
language plpgsql
security definer
set search_path = public, pos_private
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'COMPLETED'
     and coalesce(old.total_dong, 0) = 0
     and coalesce(new.total_dong, 0) > 0
     and coalesce(new.paid_dong, 0) = 0
     and coalesce(new.remaining_dong, 0) = 0
     and coalesce(new.payment_status, 'PAID') = 'PAID'
  then
    new.paid_dong := new.total_dong;
    new.remaining_dong := 0;
    new.payment_status := 'PAID';
    new.due_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pos_sales_fill_payment on public.pos_sales;
create trigger trg_pos_sales_fill_payment
  before update of total_dong on public.pos_sales
  for each row
  execute function pos_private.pos_sales_fill_payment_on_total();

comment on column public.pos_sales.payment_status is
  'UNPAID | PARTIALLY_PAID | PAID | OVERDUE. Independent of sale.status.';
comment on column public.pos_sales.paid_dong is 'Integer VND already paid.';
comment on column public.pos_sales.remaining_dong is 'Integer VND remaining.';
comment on column public.pos_sales.due_date is 'Optional due date for remaining balance.';
