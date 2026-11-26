-- F3 update: OTP bước 2 cho MỌI tài khoản pos_staff.role = ADMIN (active).
-- Trước đây chỉ allowlist 2 email. ADMIN_VIEWER / STAFF không đổi (không OTP).

create or replace function pos_private.otp_email_requires_step2(p_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
set row_security to 'off'
as $$
  select exists (
    select 1
    from public.pos_staff s
    where lower(s.email) = lower(trim(coalesce(p_email, '')))
      and s.role = 'ADMIN'
      and s.is_active
  );
$$;

comment on function pos_private.otp_email_requires_step2(text) is
  'F3: true khi email là ADMIN active trên pos_staff — bắt OTP mỗi login.';
