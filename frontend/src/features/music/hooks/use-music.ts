"use client";

import type { AxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMusicTracksDelete,
  useMusicTracksGetById,
  useMusicTracksList,
  useMusicTracksUpdate,
  useMusicTracksUpload,
} from "@/api/generated/admin-music-tracks/admin-music-tracks";
import { useMusicValidateAnswer } from "@/api/generated/music-questions/music-questions";
import type {
  ErrorResponseDto,
  MusicTracksUploadBody,
  ValidateMusicQuestionAnswerDto,
} from "@/api/generated/models";
import { toMusicUpdateRequest } from "../mappers/music-request.mapper";
import {
  toMusicAnswerValidation,
  toMusicTrack,
  toMusicTracks,
} from "../mappers/music-response.mapper";
import type { MusicTrackUpdate } from "../types/music.types";

type MusicApiError = AxiosError<ErrorResponseDto>;

export const musicKeys = {
  all: ["music-tracks"] as const,
  lists: () => [...musicKeys.all, "list"] as const,
  detail: (id: string) => [...musicKeys.all, "detail", id] as const,
};

export const useMusicTracks = () =>
  useMusicTracksList({
    query: {
      queryKey: musicKeys.lists(),
      select: (response) => toMusicTracks(response.data),
    },
  });
export const useMusicTrack = (id: string) =>
  useMusicTracksGetById(id, {
    query: {
      queryKey: musicKeys.detail(id),
      enabled: Boolean(id),
      select: (response) => toMusicTrack(response.data),
    },
  });

export function useUploadMusicTrack() {
  const client = useQueryClient();
  const mutation = useMusicTracksUpload<MusicApiError>({
    mutation: {
      onSuccess: () => {
        client.invalidateQueries({ queryKey: musicKeys.lists() });
        client.invalidateQueries({ queryKey: ["questions"] });
      },
    },
  });

  return {
    ...mutation,
    mutate: (data: MusicTracksUploadBody) => mutation.mutate({ data }),
    mutateAsync: (data: MusicTracksUploadBody) =>
      mutation
        .mutateAsync({ data })
        .then((response) => toMusicTrack(response.data)),
  };
}

export function useUpdateMusicTrack() {
  const client = useQueryClient();
  const mutation = useMusicTracksUpdate<MusicApiError>({
    mutation: {
      onSuccess: (response) => {
        const track = toMusicTrack(response.data);
        client.setQueryData(musicKeys.detail(track.id), track);
        client.invalidateQueries({ queryKey: musicKeys.lists() });
        client.invalidateQueries({ queryKey: ["questions"] });
      },
    },
  });

  return {
    ...mutation,
    mutate: (input: { id: string; update: MusicTrackUpdate }) =>
      mutation.mutate({
        id: input.id,
        data: toMusicUpdateRequest(input.update),
      }),
    mutateAsync: (input: { id: string; update: MusicTrackUpdate }) =>
      mutation
        .mutateAsync({
          id: input.id,
          data: toMusicUpdateRequest(input.update),
        })
        .then((response) => toMusicTrack(response.data)),
  };
}

export function useDeleteMusicTrack() {
  const client = useQueryClient();
  const mutation = useMusicTracksDelete<MusicApiError>({
    mutation: {
      onSuccess: (response) => {
        const track = toMusicTrack(response.data);
        client.setQueryData(musicKeys.detail(track.id), track);
        client.invalidateQueries({ queryKey: musicKeys.lists() });
        client.invalidateQueries({ queryKey: ["questions"] });
      },
    },
  });

  return {
    ...mutation,
    mutate: (id: string) => mutation.mutate({ id }),
    mutateAsync: (id: string) =>
      mutation
        .mutateAsync({ id })
        .then((response) => toMusicTrack(response.data)),
  };
}

export function useValidateMusicAnswer() {
  const mutation = useMusicValidateAnswer<MusicApiError>();
  return {
    ...mutation,
    mutate: (data: ValidateMusicQuestionAnswerDto) => mutation.mutate({ data }),
    mutateAsync: (data: ValidateMusicQuestionAnswerDto) =>
      mutation
        .mutateAsync({ data })
        .then((response) => toMusicAnswerValidation(response.data)),
  };
}
