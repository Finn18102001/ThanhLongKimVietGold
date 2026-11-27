-- Rollback giờ vào ca về 20:00 VN (overnight 20:00 → 05:00 hôm sau).
-- Giữ helper overnight từ 20261128014500; chỉ đổi setting start.

update public.pos_app_settings
set value_text = '20:00',
    updated_at = now()
where key = 'work_hours_start';
