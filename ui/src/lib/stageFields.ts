import type { StageField } from '@/api/types'

/** Returns stage fields sorted by position (ascending). */
export function sortStageFields(fields: StageField[] | undefined | null): StageField[] {
  if (!fields?.length) return []
  return [...fields].sort((a, b) => a.position - b.position)
}
