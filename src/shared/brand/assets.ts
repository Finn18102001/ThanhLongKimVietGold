/** Bump when logo binaries change — busts browser and Next image cache. */
export const BRAND_ASSET_VERSION = "20261008a";
const brandV = `?v=${BRAND_ASSET_VERSION}`;

/** Biểu tượng kim cương — nền trong suốt, dùng trên nền đỏ. */
export const BRAND_LOGO_MARK = `/brand/tlkv-logo-mark.png${brandV}`;

/** Favicon POS */
export const BRAND_FAVICON = `/brand/favicon-48.png${brandV}`;

/** Phôi hóa đơn. Chỉ vùng logo đổi; kích thước file giữ nguyên để căn chữ in. */
export const INVOICE_CERTIFICATE_BG = `/invoice/gold-certificate.png${brandV}`;
