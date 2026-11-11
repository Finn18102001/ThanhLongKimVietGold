# POS Big Update — Backup & Rollback

> Tạo: 2026-11-10 · Trước khi bắt đầu Giai đoạn 1–7  
> Contract: [`../SYSTEM_DEVELOPMENT_RULES.md`](../SYSTEM_DEVELOPMENT_RULES.md) §32, §32.1

## 1. Code backup

| Hạng mục | Giá trị |
|----------|---------|
| Git tag | `backup/pre-pos-big-update-20261110` (annotated, **local**) |
| Commit | `6bcba2f` — nhánh `Finn/New/POS-Future` |
| Lưu ý | `origin/Finn/New/POS-Future` đang **mới hơn 1 commit** (`390f5f9` — website egress). Pull trước khi bắt đầu Giai đoạn 1. |

Đẩy tag lên GitHub (khi muốn backup ngoài máy):

```powershell
git push origin backup/pre-pos-big-update-20261110
```

Rollback code:

```powershell
# Xem khác biệt so với bản backup
git diff backup/pre-pos-big-update-20261110 -- src supabase

# Khôi phục 1 file / 1 thư mục
git checkout backup/pre-pos-big-update-20261110 -- src/modules/pos

# Tạo nhánh từ bản backup (không phá nhánh đang làm)
git switch -c rollback/pos-pre-big-update backup/pre-pos-big-update-20261110
```

## 2. Database backup (Supabase `yrdqnmsvwovwhepmhigv`)

Script: [`scripts/backup/2026-11-10-pre-pos-big-update.sql`](../../scripts/backup/2026-11-10-pre-pos-big-update.sql)

Schema `tlkv_backup_20261110` (cùng DB production, **không** expose Data API, revoke `anon`/`authenticated`, RLS bật):

| Object | Nội dung | Kiểm chứng 2026-11-10 |
|--------|----------|------------------------|
| 53 bảng cùng tên `public.*` | Bản sao dữ liệu (`CREATE TABLE AS`) | 77 086 dòng, 0 bảng lệch số dòng |
| `_row_counts` | Số dòng nguồn vs backup | `source_rows = backup_rows` toàn bộ |
| `_columns`, `_constraints`, `_indexes` | DDL bảng public | — |
| `_routines` | Định nghĩa function `public` + `pos_private` | 252 function |
| `_triggers`, `_policies` | Trigger + RLS policy | 17 trigger, 71 policy |
| `_table_grants`, `_routine_grants` | Data API GRANT / EXECUTE | — |
| `_migrations` | `supabase_migrations.schema_migrations` | 168 migration (last `20261028094157`) |

Không nằm trong backup: `auth.*` (tài khoản đăng nhập), `storage.objects` (ảnh CCCD, PDF đính kèm). Các giai đoạn 1–7 không được đụng 2 vùng này.

### Rollback dữ liệu

Chỉ chạy khi đã xác định bảng bị hỏng do migration của đợt update và **đã dừng ghi** (không có giao dịch quầy đang chạy).

```sql
-- So sánh trước khi khôi phục
select count(*) from public.pos_skus;
select count(*) from tlkv_backup_20261110.pos_skus;

-- Khôi phục 1 bảng KHÔNG có giao dịch phát sinh sau backup (VD bảng cấu hình)
begin;
  delete from public.gold_price_rows;  -- chỉ khi chắc chắn, cân nhắc FK RESTRICT từ pos_skus
  insert into public.gold_price_rows select * from tlkv_backup_20261110.gold_price_rows;
commit;

-- Khôi phục 1 function về bản cũ
select definition from tlkv_backup_20261110._routines
where schema_name = 'pos_private' and proname = 'compute_unit_price';
-- → copy definition, chạy lại bằng migration mới (không sửa tay trên prod)
```

Bảng giao dịch (`pos_sales`, `pos_invoices`, `pos_buys`, `pos_inventory_transactions`, `pos_cash_ledger`, `pos_audit_log`…) **không được** khôi phục kiểu delete + insert sau khi đã có giao dịch mới (Rule 5, Rule 12). Với các bảng này: viết migration bù/sửa có audit, dùng backup chỉ để đối chiếu.

### Dọn backup

Giữ schema tới khi Giai đoạn 7 chạy ổn định trên production ≥ 2 tuần:

```sql
drop schema tlkv_backup_20261110 cascade;
```

## 3. Trước mỗi migration của từng giai đoạn

1. Snapshot lại các bảng sẽ chạm: `create table tlkv_backup_20261110.<bang>__gdN as table public.<bang>;`
2. Lưu `pg_get_functiondef` của function sẽ `create or replace`.
3. Migration theo kiểu expand → backfill → switch → contract (§32). Không drop cột cũ trong cùng migration.
4. Bảng mới: GRANT tường minh trong cùng migration (§32.1).
