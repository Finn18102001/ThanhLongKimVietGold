import { createServerSupabase } from "@/shared/supabase/server";
import type { GoldPriceQuote } from "./types";

export async function getGoldPriceQuote(): Promise<GoldPriceQuote> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("gold_price_rows")
    .select("product, purity, buy, sell, updated_at")
    .eq("product", "Nhẫn Tròn Kim Việt")
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (!data) {
    return {
      label: "Giá vàng hôm nay",
      purity: "Vàng 99.99",
      buyDong: 0,
      sellDong: 0,
      quotedAt: new Date().toISOString(),
    };
  }

  return {
    label: "Giá vàng hôm nay",
    purity: data.purity ? `Vàng ${data.purity}` : "Vàng 99.99",
    buyDong: Math.round(Number(data.buy)),
    sellDong: Math.round(Number(data.sell)),
    quotedAt: data.updated_at,
  };
}
