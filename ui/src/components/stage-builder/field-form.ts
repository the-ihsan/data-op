import type { FieldInput } from '@/api/resources'
import { parseOptions, type StageField } from '@/api/types'
import type { FieldFormState } from './types'

export function emptyFormState(): FieldFormState {
  return {
    label: '',
    key: '',
    type: 'text',
    required: false,
    isUnique: false,
    allowMultiple: false,
    maxCount: 1,
    optionsText: '',
    prevKey: '',
    defaultValue: '',
  }
}

export function fieldToFormState(field: StageField): FieldFormState {
  const allowMultiple = field.max_count !== 1
  return {
    label: field.label,
    key: field.key,
    type: field.type,
    required: field.required,
    isUnique: field.is_unique,
    allowMultiple,
    maxCount: allowMultiple ? field.max_count : 1,
    optionsText: parseOptions(field).join(', '),
    prevKey: field.prev_stage_key,
    defaultValue: field.default_value ?? '',
  }
}

export function applyInheritance(base: FieldFormState, prevField: StageField): FieldFormState {
  const allowMultiple = prevField.max_count !== 1
  return {
    ...base,
    label: prevField.label,
    type: prevField.type,
    key: prevField.key,
    required: prevField.required,
    isUnique: prevField.is_unique,
    allowMultiple,
    maxCount: allowMultiple ? prevField.max_count : 1,
    optionsText: parseOptions(prevField).join(', '),
    defaultValue: prevField.default_value ?? '',
    prevKey: prevField.key,
  }
}

export function formStateToInput(state: FieldFormState): FieldInput {
  const isChoice = state.type === 'select' || state.type === 'multiselect'
  const body: FieldInput = {
    label: state.label,
    type: state.type,
    required: state.required,
    is_unique: state.isUnique,
    max_count: state.allowMultiple ? state.maxCount : 1,
    prev_stage_key: state.prevKey || undefined,
    default_value: state.defaultValue.trim() || undefined,
  }
  if (state.key.trim()) body.key = state.key.trim()
  if (isChoice) {
    body.options = state.optionsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return body
}
