"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useUpdateSubscription, useUsers } from "@/features/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminTable, StatusBadge } from "@/components/shared";

const schema = z.object({
  userId: z.string().min(1, "معرّف المستخدم مطلوب"),
  subscriptionStatus: z.enum(["none", "active", "expired"]),
  subscriptionExpiresAt: z.string().optional(),
});

type SubscriptionFormData = z.infer<typeof schema>;

export function SubscriptionAdmin() {
  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
  } = useUsers();
  const updateSubscription = useUpdateSubscription();
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SubscriptionFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      subscriptionStatus: "active",
    },
  });

  const users = usersData || [];
  const status = watch("subscriptionStatus");

  const onSubmit = async (data: SubscriptionFormData) => {
    setMessage("");
    try {
      await updateSubscription.mutateAsync(data);
      setMessage("تم تحديث الاشتراك بنجاح");
    } catch {
      setMessage("تعذر تحديث الاشتراك. تأكد من دعم endpoint في backend.");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>تحديث اشتراك مستخدم</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">User ID</label>
              <Input {...register("userId")} />
              {errors.userId && (
                <p className="text-sm text-destructive mt-1">
                  {errors.userId.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                حالة الاشتراك
              </label>
              <Select
                value={status}
                onValueChange={(value: string) =>
                  setValue(
                    "subscriptionStatus",
                    value as SubscriptionFormData["subscriptionStatus"],
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">none</SelectItem>
                  <SelectItem value="active">active</SelectItem>
                  <SelectItem value="expired">expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                تاريخ الانتهاء
              </label>
              <Input type="date" {...register("subscriptionExpiresAt")} />
            </div>

            {message && (
              <p className="text-sm text-muted-foreground">{message}</p>
            )}

            <Button type="submit" disabled={updateSubscription.isPending}>
              {updateSubscription.isPending ? "جاري الحفظ..." : "حفظ الاشتراك"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>المستخدمون</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading && (
            <p className="text-muted-foreground">جاري تحميل المستخدمين...</p>
          )}
          {Boolean(usersError) && (
            <p className="text-sm text-muted-foreground">
              قائمة المستخدمين جاهزة في الواجهة، لكن endpoint المستخدمين غير
              متاح أو رفض الطلب.
            </p>
          )}
          {!!users.length && (
            <AdminTable
              rows={users}
              getRowKey={(user) => user.id}
              caption="قائمة المستخدمين وحالات اشتراكاتهم"
              columns={[
                {
                  key: "user",
                  header: "المستخدم",
                  cell: (user) => (
                    <div>
                      <p className="font-medium">{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  ),
                },
                {
                  key: "id",
                  header: "المعرّف",
                  cell: (user) => (
                    <span className="text-xs text-muted-foreground">{user.id}</span>
                  ),
                },
                {
                  key: "status",
                  header: "الاشتراك",
                  cell: (user) => (
                    <StatusBadge>{user.subscriptionStatus}</StatusBadge>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
