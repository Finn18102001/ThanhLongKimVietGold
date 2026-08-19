import Image from "next/image";
import Link from "next/link";
import { BRAND_LOGO_MARK } from "./assets";

type BrandLockupVariant = "sidebar" | "login" | "invoice";

export function BrandLockup({
  variant = "sidebar",
  href,
}: {
  variant?: BrandLockupVariant;
  href?: string;
}) {
  const markSize =
    variant === "invoice"
      ? { w: 72, h: 82 }
      : variant === "login"
        ? { w: 68, h: 78 }
        : { w: 64, h: 72 };

  const body = (
    <>
      <span className="brand-lockup__mark">
        <Image
          src={BRAND_LOGO_MARK}
          alt=""
          width={markSize.w}
          height={markSize.h}
          className="brand-lockup__img"
          priority={variant !== "invoice"}
        />
      </span>
      <span className="brand-lockup__text">
        <span className="brand-lockup__line">Thăng Long</span>
        <span className="brand-lockup__line brand-lockup__line--accent">Kim Việt</span>
      </span>
    </>
  );

  const rootClass = `brand-lockup brand-lockup--${variant}`;

  if (href) {
    return (
      <div className={rootClass}>
        <Link href={href} className="brand-lockup__link" title="Thăng Long Kim Việt">
          {body}
        </Link>
      </div>
    );
  }

  return (
    <div className={rootClass}>
      <div className="brand-lockup__link">{body}</div>
    </div>
  );
}
