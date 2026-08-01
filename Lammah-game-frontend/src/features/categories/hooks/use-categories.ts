"use client";
import type { AxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCategoriesCreate,
  useCategoriesDelete,
  useCategoriesGetById,
  useCategoriesList,
  useCategoriesUpdate,
} from "@/api/generated/categories/categories";
import type { ErrorResponseDto } from "@/api/generated/models";
import { CategoryPayload } from "@/types";
import { toCategoryRequest } from "../mappers/category-request.mapper";
import {
  toCategoryModel,
  toCategoryModels,
} from "../mappers/category-response.mapper";

type CategoryApiError = AxiosError<ErrorResponseDto>;

export const categoryKeys = {
  all: ["categories"] as const,
  list: (catalogId?: string) => ["categories", catalogId || "all"] as const,
  detail: (id: string) => ["categories", id] as const,
};
export function useCategories(params?: { catalogId?: string }) {
  return useCategoriesList(params, {
    query: {
      queryKey: categoryKeys.list(params?.catalogId),
      select: (response) => toCategoryModels(response.data),
      refetchOnWindowFocus: "always",
    },
  });
}
export function useCategory(id: string) {
  return useCategoriesGetById(id, {
    query: {
      queryKey: categoryKeys.detail(id),
      enabled: Boolean(id),
      select: (response) => toCategoryModel(response.data),
    },
  });
}
export function useCreateCategory() {
  const client = useQueryClient();
  const mutation = useCategoriesCreate<CategoryApiError>({
    mutation: {
      onSuccess: (response) => {
        const category = toCategoryModel(response.data);
        client.setQueryData(categoryKeys.detail(category.id), category);
        client.invalidateQueries({ queryKey: categoryKeys.all });
      },
    },
  });

  return {
    ...mutation,
    mutateAsync: (data: CategoryPayload) =>
      mutation
        .mutateAsync({ data: toCategoryRequest(data) })
        .then((response) => toCategoryModel(response.data)),
  };
}
export function useUpdateCategory(id: string) {
  const client = useQueryClient();
  const mutation = useCategoriesUpdate<CategoryApiError>({
    mutation: {
      onSuccess: (response) => {
        const category = toCategoryModel(response.data);
        client.setQueryData(categoryKeys.detail(id), category);
        client.invalidateQueries({ queryKey: categoryKeys.all });
      },
    },
  });

  return {
    ...mutation,
    mutateAsync: (data: CategoryPayload) =>
      mutation
        .mutateAsync({ id, data: toCategoryRequest(data) })
        .then((response) => toCategoryModel(response.data)),
  };
}
export function useDeleteCategory() {
  const client = useQueryClient();
  const mutation = useCategoriesDelete<CategoryApiError>({
    mutation: {
      onSuccess: () => client.invalidateQueries({ queryKey: categoryKeys.all }),
    },
  });

  return {
    ...mutation,
    mutate: (id: string) => mutation.mutate({ id }),
    mutateAsync: (id: string) => mutation.mutateAsync({ id }),
  };
}
