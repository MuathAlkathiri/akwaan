"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateCatalog, useUpdateCatalog } from "../hooks/use-catalogs";
import { getEntityId } from "@/lib/utils";
import { Catalog } from "@/types";

const catalogSchema = z.object({
  name: z.string().min(1, "اسم الكتالوج مطلوب"),
  isActive: z.boolean(),
});

type CatalogFormData = z.infer<typeof catalogSchema>;

interface CatalogFormProps {
  catalog?: Catalog;
  onSuccess?: () => void;
}

export function CatalogForm({ catalog, onSuccess }: CatalogFormProps) {
  const catalogId = catalog ? getEntityId(catalog) : "";
  const createCatalog = useCreateCatalog();
  const updateCatalog = useUpdateCatalog(catalogId);
  const isPending = createCatalog.isPending || updateCatalog.isPending;
  const form = useForm<CatalogFormData>({
    resolver: zodResolver(catalogSchema),
    defaultValues: {
      name: catalog?.name.ar ?? "",
      isActive: catalog?.isActive ?? true,
    },
  });

  const onSubmit = async (data: CatalogFormData) => {
    const catalogName = data.name.trim();
    const payload = {
      name: {
        ar: catalogName,
        en: catalogName,
      },
      isActive: data.isActive,
    };

    if (catalogId) {
      await updateCatalog.mutateAsync(payload);
    } else {
      await createCatalog.mutateAsync(payload);
    }

    onSuccess?.();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>اسم الكتالوج</FormLabel>
              <FormControl>
                <Input placeholder="مثال: رياضة" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormLabel>نشط</FormLabel>
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {isPending
            ? "جاري الحفظ..."
            : catalogId
              ? "حفظ الكتالوج"
              : "إنشاء كتالوج"}
        </Button>
      </form>
    </Form>
  );
}
