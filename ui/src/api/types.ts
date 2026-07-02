export interface User {
  id: number
  name: string
  username: string
  email?: string
}

export type Visibility = 'public' | 'private'
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface Campaign {
  id: number
  name: string
  description: string
  visibility: Visibility
  status: CampaignStatus
  allow_concurrent_edit: boolean
  created_by: number
  stages?: Stage[]
}

export type Role = 'owner' | 'manager' | 'member'

export interface CampaignMember {
  id: number
  campaign_id: number
  user_id: number
  role: Role
  can_add: boolean
  can_edit: boolean
  can_delete: boolean
  user?: User
}

export interface Stage {
  id: number
  campaign_id: number
  name: string
  position: number
  fields?: StageField[]
  unique_constraints?: StageUniqueConstraint[]
}

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'facebook_profile'
  | 'facebook_group'
  | 'facebook_page'

export const FACEBOOK_URL_FIELD_TYPES = [
  'facebook_profile',
  'facebook_group',
  'facebook_page',
] as const satisfies readonly FieldType[]

export function isFacebookUrlField(type: FieldType): boolean {
  return (FACEBOOK_URL_FIELD_TYPES as readonly string[]).includes(type)
}

export function facebookUrlPlaceholder(type: FieldType): string {
  switch (type) {
    case 'facebook_group':
      return 'facebook.com/groups/…'
    case 'facebook_page':
      return 'facebook.com/pagename'
    default:
      return 'facebook.com/username'
  }
}

export interface StageField {
  id: number
  stage_id: number
  key: string
  label: string
  type: FieldType
  required: boolean
  is_unique: boolean
  max_count: number
  options: string // JSON-encoded string[]
  prev_stage_key: string
  position: number
}

export interface StageUniqueConstraint {
  id: number
  stage_id: number
  field_keys: string // JSON-encoded string[]
}

export type RecordStatus = 'open' | 'processing' | 'finished'

export interface RecordRow {
  id: number
  campaign_id: number
  current_stage_id: number
  status: RecordStatus
  locked_by: number | null
  created_by: number
  values?: RecordValue[]
}

export interface RecordValue {
  id: number
  record_id: number
  stage_id: number
  field_id: number
  field_key: string
  value: string
  value_index: number
}

export interface RecordFormData {
  record: RecordRow
  stage: Stage
  fields: StageField[]
  values: Record<string, string[]>
}

export interface PaginatedRecords {
  records: RecordRow[]
  total: number
  page: number
  per_page: number
}

export interface TransitionUser {
  id: number
  name: string
  username: string
}

export interface TransitionStage {
  id: number
  name: string
}

export interface RecordTransitionEntry {
  id: number
  from_stage: TransitionStage | null
  to_stage: TransitionStage
  by: TransitionUser
  note: string
  created_at: string
}

export interface RecordHistory {
  transitions: RecordTransitionEntry[]
}

export interface BulkImportResult {
  succeeded: number
  failed: Array<{ index: number; error: string }>
}

export interface Analytics {
  total_records: number
  by_stage: { stage_id: number; name: string; position: number; count: number }[]
  by_status: Record<RecordStatus, number>
  throughput: { date: string; count: number }[]
}

/** Parse a field's JSON-encoded option list into a string array. */
export function parseOptions(field: StageField): string[] {
  if (!field.options) return []
  try {
    return JSON.parse(field.options) as string[]
  } catch {
    return []
  }
}

export function parseFieldKeys(c: StageUniqueConstraint): string[] {
  try {
    return JSON.parse(c.field_keys) as string[]
  } catch {
    return []
  }
}
