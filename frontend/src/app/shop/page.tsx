import { Suspense } from "react";
import type { Metadata } from "next";
import { Shop } from "@/features/payments/components/shop";

export const metadata: Metadata = {
  title: "المتجر",
  description:
    "اشترِ رصيد مباريات في أكوان. مباراة وحدة 15 ريال، 5 مباريات 60 ريال، 15 مباراة 150 ريال. بلا اشتراك ولا تجديد تلقائي.",
};

export default function ShopPage() {
  // `useSearchParams` inside the shop reads the charge a player comes back
  // with, and Next needs the boundary for it.
  return (
    <Suspense fallback={null}>
      <Shop />
    </Suspense>
  );
}
