"use client";

import { useState } from "react";

import { getApiErrorMessage } from "@/lib/utils";
import type {
  RankedListEntry,
} from "@/types";

import {
  useGenerateAcceptedAnswers,
  useGenerateRankedAcceptedAnswers,
} from "./use-questions";
import {
  mergeAcceptedAnswers,
} from "../components/accepted-answers-editor";

export function useQuestionAliasGeneration() {
  const generateOne = useGenerateAcceptedAnswers();
  const generateAll = useGenerateRankedAcceptedAnswers();

  const [warning, setWarning] = useState<string>();

  const generateStandard = async ({
    question,
    answer,
    categoryId,
    currentAliases,
  }: {
    question: string;
    answer: string;
    categoryId?: string;
    currentAliases: string[];
  }): Promise<string[]> => {
    setWarning(undefined);

    try {
      const response = await generateOne.mutateAsync({
        data: {
          questionText: question,
          canonicalAnswerAr: answer,
          categoryId: categoryId || undefined,
          locale: "mixed",
        },
      });

      if (response.warnings.length) {
        setWarning(response.warnings.join("، "));
      }

      return mergeAcceptedAnswers(
        currentAliases,
        response.aliases.map(
          (alias) => alias.value,
        ),
      );
    } catch (error) {
      setWarning(
        getApiErrorMessage(
          error,
          "تعذر توليد الأسماء المقبولة. يمكنك إضافتها يدويًا.",
        ),
      );

      return currentAliases;
    }
  };

  const generateRanked = async ({
    question,
    categoryId,
    entries,
  }: {
    question: string;
    categoryId?: string;
    entries: RankedListEntry[];
  }): Promise<{
    entries: RankedListEntry[];
    warnings: Record<number, string[]>;
  }> => {
    setWarning(undefined);

    try {
      const response = await generateAll.mutateAsync({
        data: {
          questionText: question,
          categoryId: categoryId || undefined,
          locale: "mixed",

          entries: entries.map(
            (entry, index) => ({
              clientId:
                entry.id ?? `row-${index}`,
              canonicalAnswerAr:
                entry.answer.ar,
              canonicalAnswerEn:
                entry.answer.en || undefined,
            }),
          ),
        },
      });

      const generatedById = new Map(
        response.entries.map((entry) => [
          entry.clientId,
          entry,
        ]),
      );

      const nextEntries = entries.map(
        (entry, index) => {
          const generated = generatedById.get(
            entry.id ?? `row-${index}`,
          );

          return {
            ...entry,

            aliases: mergeAcceptedAnswers(
              entry.aliases,
              generated?.aliases.map(
                (alias) => alias.value,
              ) ?? [],
            ),
          };
        },
      );

      const rowWarnings: Record<
        number,
        string[]
      > = {};

      entries.forEach((entry, index) => {
        const generated = generatedById.get(
          entry.id ?? `row-${index}`,
        );

        if (generated?.warnings.length) {
          rowWarnings[index] =
            generated.warnings;
        }
      });

      if (response.warnings.length) {
        setWarning(response.warnings.join("، "));
      }

      return {
        entries: nextEntries,
        warnings: rowWarnings,
      };
    } catch (error) {
      setWarning(
        getApiErrorMessage(
          error,
          "تعذر توليد الأسماء لكل الصفوف.",
        ),
      );

      return {
        entries,
        warnings: {},
      };
    }
  };

  return {
    warning,

    standardPending: generateOne.isPending,
    rankedPending: generateAll.isPending,

    generateStandard,
    generateRanked,
  };
}