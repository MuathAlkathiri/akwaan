"use client";

import type { AxiosError } from "axios";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGamesAwardPoints,
  useGamesCreate,
  useGamesGetById,
  useGamesGetQuestionAnswerView,
  useGamesGetQuestionView,
  useGamesGetRankedListRoundState,
  useGamesStartRankedListRound,
  useGamesSubmitRankedListAnswer,
  useGamesExpireRankedListTurn,
  useGamesFinalizeRankedListRound,
  useGamesList,
  useGamesRevealAnswer,
  useGamesRevealQuestionView,
  useGamesSkipQuestion,
  useGamesSubmitQuestionResult,
} from "@/api/generated/games/games";
import type { ErrorResponseDto, GameResponseDto } from "@/api/generated/models";
import type {
  RankedListRoundActionEnvelopeDto,
  RankedListRoundStateEnvelopeDto,
} from "@/api/generated/models";
import type { CreateGamePayload, Game } from "@/types";
import { toCreateGameRequest } from "../mappers/game-request.mapper";
import { toGame, toGames } from "../mappers/game-response.mapper";
import { useAuth } from "@/components/auth/auth-provider";
import apiClient from "@/lib/api/client";

type GameApiError = AxiosError<ErrorResponseDto>;
type GameMutationOptions = { onSuccess?: (game: Game) => void };

export const gameKeys = {
  all: ["games"] as const,
  detail: (id: string) => ["games", id] as const,
  rankedList: (id: string, questionId: string) =>
    ["games", id, "ranked-list", questionId] as const,
  question: (id: string, gameQuestionId: string) =>
    ["games", id, "questions", gameQuestionId] as const,
  answer: (id: string, gameQuestionId: string) =>
    ["games", id, "questions", gameQuestionId, "answer"] as const,
};

export function mergeRankedListRoundActionIntoCache(
  current: RankedListRoundStateEnvelopeDto | undefined,
  response: RankedListRoundActionEnvelopeDto,
): RankedListRoundStateEnvelopeDto {
  return {
    statusCode: current?.statusCode ?? response.statusCode,
    data: response.data.state,
  };
}

function useGameCache(gameId: string) {
  const client = useQueryClient();
  return {
    write(response: { data: Parameters<typeof toGame>[0] }) {
      const game = toGame(response.data);
      client.setQueryData(gameKeys.detail(game.id), game);
      client.invalidateQueries({ queryKey: gameKeys.all });
      return game;
    },
    refreshOnConflict(error: GameApiError) {
      if (error.response?.data.code !== "CONCURRENT_GAME_UPDATE") return;
      client.invalidateQueries({ queryKey: gameKeys.detail(gameId) });
      client.refetchQueries({ queryKey: gameKeys.detail(gameId), exact: true });
    },
  };
}

export const useGames = () => {
  const { user } = useAuth();
  return useGamesList({
    query: {
      queryKey: [...gameKeys.all, user?.id ?? "anonymous"],
      enabled: Boolean(user?.id),
      select: (response) => toGames(response.data),
    },
  });
};

export const useGame = (id: string) =>
  useGamesGetById(id, {
    query: {
      queryKey: gameKeys.detail(id),
      enabled: Boolean(id),
      select: (response) => toGame(response.data),
    },
  });

export const useGameQuestion = (gameId: string, gameQuestionId: string) =>
  useGamesGetQuestionView(gameId, gameQuestionId, {
    query: {
      queryKey: gameKeys.question(gameId, gameQuestionId),
      enabled: Boolean(gameId && gameQuestionId),
      retry: false,
      select: (response) => response.data,
    },
  });

export const useGameQuestionAnswer = (gameId: string, gameQuestionId: string) =>
  useGamesGetQuestionAnswerView(gameId, gameQuestionId, {
    query: {
      queryKey: gameKeys.answer(gameId, gameQuestionId),
      enabled: Boolean(gameId && gameQuestionId),
      retry: false,
      select: (response) => response.data,
    },
  });

export function useRevealGameQuestion(gameId: string, gameQuestionId: string) {
  const client = useQueryClient();
  const mutation = useGamesRevealQuestionView<GameApiError>();
  return {
    ...mutation,
    mutateAsync: () =>
      mutation.mutateAsync({ id: gameId, gameQuestionId }).then((response) => {
        client.setQueryData(gameKeys.answer(gameId, gameQuestionId), response);
        client.invalidateQueries({
          queryKey: gameKeys.question(gameId, gameQuestionId),
        });
        return response.data;
      }),
  };
}

export function useSubmitGameQuestionResult(
  gameId: string,
  gameQuestionId: string,
) {
  const cache = useGameCache(gameId);
  const client = useQueryClient();
  const mutation = useGamesSubmitQuestionResult<GameApiError>({
    mutation: { onSuccess: cache.write, onError: cache.refreshOnConflict },
  });
  return {
    ...mutation,
    mutateAsync: (teamId: string | null) =>
      mutation
        .mutateAsync({
          id: gameId,
          gameQuestionId,
          data: { teamId },
        })
        .then((response) => {
          client.invalidateQueries({
            queryKey: gameKeys.answer(gameId, gameQuestionId),
          });
          return cache.write(response);
        }),
  };
}

export function useCreateGame() {
  const cache = useGameCache("");
  const mutation = useGamesCreate<GameApiError>({
    mutation: { onSuccess: cache.write },
  });
  return {
    ...mutation,
    mutateAsync: (data: CreateGamePayload) =>
      mutation
        .mutateAsync({ data: toCreateGameRequest(data) })
        .then((response) => toGame(response.data)),
  };
}

export function useReplayGame() {
  const cache = useGameCache("");
  return useMutation<Game, GameApiError, string>({
    mutationFn: async (gameId) => {
      const response = await apiClient.post<{ data: GameResponseDto }>(
        `/games/${gameId}/replay`,
      );
      return cache.write(response.data);
    },
  });
}

export function useAdjustGameScore(gameId: string) {
  const cache = useGameCache(gameId);
  return useMutation<
    Game,
    GameApiError,
    { teamIndex: 0 | 1; delta: -50 | 50 }
  >({
    mutationFn: async (input) => {
      const response = await apiClient.post<{ data: GameResponseDto }>(
        `/games/${gameId}/adjust-score`,
        input,
      );
      return cache.write(response.data);
    },
    onError: cache.refreshOnConflict,
  });
}

export function useChangeGameTurn(gameId: string) {
  const cache = useGameCache(gameId);
  return useMutation<Game, GameApiError>({
    mutationFn: async () => {
      const response = await apiClient.post<{ data: GameResponseDto }>(
        `/games/${gameId}/change-turn`,
      );
      return cache.write(response.data);
    },
    onError: cache.refreshOnConflict,
  });
}

export function useRevealAnswer(gameId: string) {
  const cache = useGameCache(gameId);
  const mutation = useGamesRevealAnswer<GameApiError>({
    mutation: { onSuccess: cache.write, onError: cache.refreshOnConflict },
  });
  return {
    ...mutation,
    mutate: (questionId: string, options?: GameMutationOptions) =>
      mutation.mutate(
        { id: gameId, data: { questionId } },
        {
          onSuccess: (response) => options?.onSuccess?.(toGame(response.data)),
        },
      ),
    mutateAsync: (questionId: string) =>
      mutation
        .mutateAsync({ id: gameId, data: { questionId } })
        .then((response) => toGame(response.data)),
  };
}

export function useAwardPoints(gameId: string) {
  const cache = useGameCache(gameId);
  const mutation = useGamesAwardPoints<GameApiError>({
    mutation: { onSuccess: cache.write, onError: cache.refreshOnConflict },
  });
  return {
    ...mutation,
    mutate: (
      input: { questionId: string; teamIndex: 0 | 1 },
      options?: GameMutationOptions,
    ) =>
      mutation.mutate(
        { id: gameId, data: input },
        {
          onSuccess: (response) => options?.onSuccess?.(toGame(response.data)),
        },
      ),
    mutateAsync: (input: { questionId: string; teamIndex: 0 | 1 }) =>
      mutation
        .mutateAsync({ id: gameId, data: input })
        .then((response) => toGame(response.data)),
  };
}

export function useSkipQuestion(gameId: string) {
  const cache = useGameCache(gameId);
  const mutation = useGamesSkipQuestion<GameApiError>({
    mutation: { onSuccess: cache.write, onError: cache.refreshOnConflict },
  });
  return {
    ...mutation,
    mutate: (questionId: string, options?: GameMutationOptions) =>
      mutation.mutate(
        { id: gameId, data: { questionId } },
        {
          onSuccess: (response) => options?.onSuccess?.(toGame(response.data)),
        },
      ),
    mutateAsync: (questionId: string) =>
      mutation
        .mutateAsync({ id: gameId, data: { questionId } })
        .then((response) => toGame(response.data)),
  };
}

export function useRankedListRound(
  gameId: string,
  questionId: string,
  enabled = true,
) {
  const client = useQueryClient();
  const queryKey = gameKeys.rankedList(gameId, questionId);
  const refreshGame = () => {
    client.invalidateQueries({ queryKey: gameKeys.detail(gameId) });
  };
  const query = useGamesGetRankedListRoundState(gameId, questionId, {
    query: {
      queryKey,
      enabled: enabled && Boolean(gameId && questionId),
      retry: false,
      refetchInterval: 3_000,
      select: (response) => response.data,
    },
  });
  const writeAction = (response: RankedListRoundActionEnvelopeDto) => {
    // The generated GET query caches the HTTP envelope and exposes its inner
    // state through `select`. Preserve that cache shape so the selector never
    // observes a transient `undefined` value between the mutation response and
    // the next background reconciliation poll.
    client.setQueryData<RankedListRoundStateEnvelopeDto>(
      queryKey,
      (current) => mergeRankedListRoundActionIntoCache(current, response),
    );
    if (response.data.state.status === "completed") refreshGame();
  };
  const startMutation = useGamesStartRankedListRound<GameApiError>({
    mutation: {
      onSuccess: writeAction,
      onError: (error) => {
        if (error.response?.data.code === "CONCURRENT_GAME_UPDATE")
          refreshGame();
      },
    },
  });
  const submitMutation = useGamesSubmitRankedListAnswer<GameApiError>({
    mutation: {
      onMutate: () => client.cancelQueries({ queryKey }),
      onSuccess: writeAction,
    },
  });
  const expireMutation = useGamesExpireRankedListTurn<GameApiError>({
    mutation: {
      onMutate: () => client.cancelQueries({ queryKey }),
      onSuccess: writeAction,
    },
  });
  const finalizeMutation = useGamesFinalizeRankedListRound<GameApiError>({
    mutation: {
      onMutate: () => client.cancelQueries({ queryKey }),
      onSuccess: writeAction,
    },
  });

  return {
    ...query,
    start: () =>
      startMutation.mutateAsync({
        id: gameId,
        data: { questionId },
      }),
    submit: (answer: string, turnSequence: number) =>
      submitMutation.mutateAsync({
        id: gameId,
        questionId,
        data: { answer, expectedTurnSequence: turnSequence },
      }),
    expire: (turnSequence: number) =>
      expireMutation.mutateAsync({
        id: gameId,
        questionId,
        data: { expectedTurnSequence: turnSequence },
      }),
    finalize: () => finalizeMutation.mutateAsync({ id: gameId, questionId }),
    isStarting: startMutation.isPending,
    isSubmitting: submitMutation.isPending,
    isExpiring: expireMutation.isPending,
    isFinalizing: finalizeMutation.isPending,
  };
}
