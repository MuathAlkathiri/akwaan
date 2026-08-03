"use client";
import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

import { showToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";
import { describeIssues, extractIssues } from "../utils/readiness.util";

type CreateMutation<T> = UseMutationResult<
  T,
  unknown,
  { data: Record<string, unknown>; file?: File }
>;
type UpdateMutation<T> = UseMutationResult<
  T,
  unknown,
  { id: string; data: Record<string, unknown>; file?: File }
>;

interface UseEntityFormSubmitOptions<T> {
  entityId?: string;
  createMutation: CreateMutation<T>;
  updateMutation: UpdateMutation<T>;
  successMessage: string;
  errorMessage: string;
}

/**
 * Shared create-vs-update dispatch for every World Management form. Domain
 * validation returns every failing rule at once, so the whole list is surfaced
 * rather than just the first message.
 */
export function useEntityFormSubmit<T>({
  entityId,
  createMutation,
  updateMutation,
  successMessage,
  errorMessage,
}: UseEntityFormSubmitOptions<T>) {
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const isPending = createMutation.isPending || updateMutation.isPending;

  const submit = async (data: Record<string, unknown>, file?: File) => {
    setError("");
    setIssues([]);
    try {
      if (entityId) {
        await updateMutation.mutateAsync({ id: entityId, data, file });
      } else {
        await createMutation.mutateAsync({ data, file });
      }
      showToast({ type: "success", message: successMessage });
      return true;
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, errorMessage));
      setIssues(describeIssues(extractIssues(submitError)));
      return false;
    }
  };

  return { submit, isPending, error, issues };
}
