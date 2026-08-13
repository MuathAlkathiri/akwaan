import { SubscriptionAdmin } from "@/components/subscriptions/subscription-admin";

export function UserAdminScreen() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">إدارة الاشتراكات</h1>
      <SubscriptionAdmin />
    </div>
  );
}
