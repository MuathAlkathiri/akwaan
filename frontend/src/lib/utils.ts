import { clsx, type ClassValue } from "clsx"
import axios from "axios"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

export function getDifficultyLabel(difficulty: string): string {
  const labels: Record<string, string> = {
    easy: "سهل",
    medium: "متوسط",
    hard: "صعب",
  }
  return labels[difficulty] || difficulty
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "مسودة",
    approved: "موافق عليه",
    rejected: "مرفوض",
    setup: "إعداد",
    in_progress: "جاري",
    finished: "مكتمل",
  }
  return labels[status] || status
}

export function getQuestionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    text: "نص",
    image: "صورة",
    audio: "صوت",
    video: "فيديو",
  }
  return labels[type] || type
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback
  }

  const responseData = error.response?.data
  if (!responseData) return fallback
  if (typeof responseData === "string") return responseData

  const message = responseData.message || responseData.error
  // Some endpoints return structured validation entries; only render text, never
  // a stringified object.
  if (Array.isArray(message)) {
    const readable = message.filter(
      (entry): entry is string => typeof entry === "string",
    )
    return readable.length ? readable.join("، ") : fallback
  }
  if (typeof message === "string") return message

  return fallback
}

export function getEntityId(entity: { id?: string; _id?: string }): string {
  return entity.id || entity._id || ""
}
