"use client";

import type { ReactNode } from "react";

import { ConfirmationDialog } from "./confirmation-dialog";

interface DeleteDialogProps {
  trigger: ReactNode;
  itemName: string;
  disabled?: boolean;
  onDelete: () => void;
}

export function DeleteDialog({
  trigger,
  itemName,
  disabled,
  onDelete,
}: DeleteDialogProps) {
  return (
    <ConfirmationDialog
      trigger={trigger}
      title={`حذف ${itemName}؟`}
      description="لا يمكن التراجع عن هذا الإجراء بعد تأكيد الحذف."
      confirmLabel="حذف"
      destructive
      disabled={disabled}
      onConfirm={onDelete}
    />
  );
}
