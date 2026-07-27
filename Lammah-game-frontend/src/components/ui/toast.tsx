"use client";

import { toast } from "sonner";

type ToastPayload = {
  type?: "success" | "error";
  message: string;
};

export function showToast({ type = "success", message }: ToastPayload) {
  if (type === "error") {
    toast.error(message);
    return;
  }
  toast.success(message);
}
