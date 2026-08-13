"use client";
import type { AxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCatalogsCreate,
  useCatalogsDelete,
  useCatalogsGetById,
  useCatalogsList,
  useCatalogsUpdate,
} from "@/api/generated/catalogs/catalogs";
import type { ErrorResponseDto } from "@/api/generated/models";
import { CatalogPayload } from "@/types";
import { toCatalogRequest } from "../mappers/catalog-request.mapper";
import {
  toCatalogModel,
  toCatalogModels,
} from "../mappers/catalog-response.mapper";

type CatalogApiError = AxiosError<ErrorResponseDto>;

export const catalogKeys = {
  all: ["catalogs"] as const,
  detail: (id: string) => ["catalogs", id] as const,
};
export function useCatalogs() {
  return useCatalogsList({
    query: {
      queryKey: catalogKeys.all,
      select: (response) => toCatalogModels(response.data),
    },
  });
}
export function useCatalog(id: string) {
  return useCatalogsGetById(id, {
    query: {
      queryKey: catalogKeys.detail(id),
      enabled: Boolean(id),
      select: (response) => toCatalogModel(response.data),
    },
  });
}
export function useCreateCatalog() {
  const client = useQueryClient();
  const mutation = useCatalogsCreate<CatalogApiError>({
    mutation: {
      onSuccess: (response) => {
        const catalog = toCatalogModel(response.data);
        client.setQueryData(catalogKeys.detail(catalog.id), catalog);
        client.invalidateQueries({ queryKey: catalogKeys.all });
      },
    },
  });

  return {
    ...mutation,
    mutateAsync: (data: CatalogPayload) =>
      mutation
        .mutateAsync({ data: toCatalogRequest(data) })
        .then((response) => toCatalogModel(response.data)),
  };
}
export function useUpdateCatalog(id: string) {
  const client = useQueryClient();
  const mutation = useCatalogsUpdate<CatalogApiError>({
    mutation: {
      onSuccess: (response) => {
        const catalog = toCatalogModel(response.data);
        client.setQueryData(catalogKeys.detail(id), catalog);
        client.invalidateQueries({ queryKey: catalogKeys.all });
        client.invalidateQueries({ queryKey: ["categories"] });
      },
    },
  });

  return {
    ...mutation,
    mutateAsync: (data: CatalogPayload) =>
      mutation
        .mutateAsync({ id, data: toCatalogRequest(data) })
        .then((response) => toCatalogModel(response.data)),
  };
}
export function useDeleteCatalog() {
  const client = useQueryClient();
  const mutation = useCatalogsDelete<CatalogApiError>({
    mutation: {
      onSuccess: () => client.invalidateQueries({ queryKey: catalogKeys.all }),
    },
  });

  return {
    ...mutation,
    mutateAsync: (id: string) => mutation.mutateAsync({ id }),
  };
}
