-- ============================================================
-- Quyền bảng cho Supabase Data API (PostgREST / supabase-js)
--
-- Từ 30/05/2026: project mới không còn GRANT mặc định cho bảng public.
-- Từ 30/10/2026: áp dụng mọi project. Thiếu quyền → lỗi 42501 (PostgREST
-- thường gợi ý câu GRANT cần chạy).
--
-- Chạy file này trong Supabase → SQL Editor sau khi đã tạo bảng.
-- Chạy lại an toàn (GRANT idempotent). Bảng chưa tồn tại thì bỏ qua.
-- RLS vẫn kiểm soát hàng; GRANT chỉ cho phép role gọi lệnh SQL tương ứng.
-- ============================================================

do $$
begin
  -- gold_meta, gold_price_rows, products
  if to_regclass('public.gold_meta') is not null then
    execute 'grant select on public.gold_meta to anon';
    execute 'grant select, insert, update, delete on public.gold_meta to authenticated';
    execute 'grant select, insert, update, delete on public.gold_meta to service_role';
  end if;

  if to_regclass('public.gold_price_rows') is not null then
    execute 'grant select on public.gold_price_rows to anon';
    execute 'grant select, insert, update, delete on public.gold_price_rows to authenticated';
    execute 'grant select, insert, update, delete on public.gold_price_rows to service_role';
  end if;

  if to_regclass('public.products') is not null then
    execute 'grant select on public.products to anon';
    execute 'grant select, insert, update, delete on public.products to authenticated';
    execute 'grant select, insert, update, delete on public.products to service_role';
  end if;

  -- Lịch sử thay đổi admin (admin-audit.js): đọc công khai, ghi khi authenticated
  if to_regclass('public.gold_price_change_log') is not null then
    execute 'grant select on public.gold_price_change_log to anon';
    execute 'grant select, insert, update, delete on public.gold_price_change_log to authenticated';
    execute 'grant select, insert, update, delete on public.gold_price_change_log to service_role';
  end if;

  if to_regclass('public.product_change_log') is not null then
    execute 'grant select on public.product_change_log to anon';
    execute 'grant select, insert, update, delete on public.product_change_log to authenticated';
    execute 'grant select, insert, update, delete on public.product_change_log to service_role';
  end if;
end $$;
