-- POS catalog / operational reads for ADMIN|STAFF (not admin-only).
-- Direct table selects from POS UI must not depend on tlkv_is_admin().

drop policy if exists pos_skus_admin_select on public.pos_skus;
drop policy if exists pos_skus_pos_select on public.pos_skus;
create policy pos_skus_pos_select
  on public.pos_skus for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_stock_admin_select on public.pos_inventory_stock;
drop policy if exists pos_stock_pos_select on public.pos_inventory_stock;
create policy pos_stock_pos_select
  on public.pos_inventory_stock for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_customers_admin_select on public.pos_customers;
drop policy if exists pos_customers_pos_select on public.pos_customers;
create policy pos_customers_pos_select
  on public.pos_customers for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_sales_admin_select on public.pos_sales;
drop policy if exists pos_sales_pos_select on public.pos_sales;
create policy pos_sales_pos_select
  on public.pos_sales for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_sale_items_admin_select on public.pos_sale_items;
drop policy if exists pos_sale_items_pos_select on public.pos_sale_items;
create policy pos_sale_items_pos_select
  on public.pos_sale_items for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_invoices_admin_select on public.pos_invoices;
drop policy if exists pos_invoices_pos_select on public.pos_invoices;
create policy pos_invoices_pos_select
  on public.pos_invoices for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_tx_admin_select on public.pos_inventory_transactions;
drop policy if exists pos_tx_pos_select on public.pos_inventory_transactions;
create policy pos_tx_pos_select
  on public.pos_inventory_transactions for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_purchase_admin_select on public.pos_purchase_receipts;
drop policy if exists pos_purchase_pos_select on public.pos_purchase_receipts;
create policy pos_purchase_pos_select
  on public.pos_purchase_receipts for select to authenticated
  using (public.tlkv_has_pos_access());

drop policy if exists pos_purchase_items_admin_select on public.pos_purchase_items;
drop policy if exists pos_purchase_items_pos_select on public.pos_purchase_items;
create policy pos_purchase_items_pos_select
  on public.pos_purchase_items for select to authenticated
  using (public.tlkv_has_pos_access());
