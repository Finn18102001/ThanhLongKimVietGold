# POS — Dev build / hard-test

> Khi user nói **build port cho POS** (hoặc tương đương): dùng file này.

## Port

```powershell
npm run dev
```

- Mặc định: **http://localhost:3000**
- Nếu 3000 bận: dùng port Next báo (thường 3001). Không nhảy deep-link trước khi login.

## Tài khoản hard-test (mặc định)

| Mục | Giá trị |
|-----|---------|
| Email | `tuananh18101@gmail.com` |
| Password | `1234567` |

Luồng DevTools / browser MCP:

1. Boot `npm run dev` trên port 3000 (hoặc 3001 nếu bận).
2. Mở `/login`, đăng nhập bằng tài khoản trên, chờ shell admin sẵn.
3. Điều hướng qua menu/sidebar tới màn cần test (không deep-link bỏ qua login).

## Ghi chú

- Local dev dùng chung DB production — hard-test tạo giao dịch thật thì ghi mã chứng từ để void/đảo.
- Không commit mật khẩu vào code app; chỉ ghi ở file tài liệu hard-test này.
