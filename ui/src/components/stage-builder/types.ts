import type { FieldType } from '@/api/types'

export type FieldFormState = {
  label: string
  key: string
  type: FieldType
  required: boolean
  isUnique: boolean
  allowMultiple: boolean
  maxCount: number
  optionsText: string
  prevKey: string
  defaultValue: string
}
