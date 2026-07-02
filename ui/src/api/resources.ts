import { api, unwrap } from './client'
import type {
  Analytics,
  BulkImportResult,
  Campaign,
  CampaignMember,
  PaginatedRecords,
  RecordFormData,
  RecordHistory,
  RecordRow,
  Stage,
  StageField,
  StageUniqueConstraint,
  User,
} from './types'

// --- Auth ---
export const authApi = {
  register: (body: { name: string; username: string; password: string }) =>
    unwrap<{ user: User; token: string }>(api.post('/auth/register', body)),
  login: (body: { username: string; password: string }) =>
    unwrap<{ user: User; token: string }>(api.post('/auth/login', body)),
  me: () => unwrap<User>(api.get('/auth/me')),
}

// --- Campaigns ---
export const campaignApi = {
  list: () => unwrap<Campaign[]>(api.get('/campaigns')),
  get: (id: number) => unwrap<Campaign>(api.get(`/campaigns/${id}`)),
  create: (body: Partial<Campaign>) => unwrap<Campaign>(api.post('/campaigns', body)),
  update: (id: number, body: Partial<Campaign>) =>
    unwrap<Campaign>(api.put(`/campaigns/${id}`, body)),
  remove: (id: number) => api.delete(`/campaigns/${id}`),
}

// --- Members ---
export const memberApi = {
  list: (campaignId: number) =>
    unwrap<CampaignMember[]>(api.get(`/campaigns/${campaignId}/members`)),
  add: (campaignId: number, body: Partial<CampaignMember> & { username: string }) =>
    unwrap<CampaignMember>(api.post(`/campaigns/${campaignId}/members`, body)),
  update: (campaignId: number, memberId: number, body: Partial<CampaignMember>) =>
    unwrap<CampaignMember>(api.put(`/campaigns/${campaignId}/members/${memberId}`, body)),
  remove: (campaignId: number, memberId: number) =>
    api.delete(`/campaigns/${campaignId}/members/${memberId}`),
}

// --- Stages ---
export const stageApi = {
  list: (campaignId: number) =>
    unwrap<Stage[]>(api.get(`/campaigns/${campaignId}/stages`)),
  create: (campaignId: number, body: { name: string; position?: number; sanitize_entry?: string }) =>
    unwrap<Stage>(api.post(`/campaigns/${campaignId}/stages`, body)),
  update: (
    campaignId: number,
    stageId: number,
    body: { name?: string; position?: number; sanitize_entry?: string },
  ) => unwrap<Stage>(api.put(`/campaigns/${campaignId}/stages/${stageId}`, body)),
  remove: (campaignId: number, stageId: number) =>
    api.delete(`/campaigns/${campaignId}/stages/${stageId}`),
}

// --- Fields ---
export interface FieldInput {
  key?: string
  label: string
  type: string
  required?: boolean
  is_unique?: boolean
  max_count?: number
  options?: string[]
  prev_stage_key?: string
  default_value?: string
  position?: number
}

export const fieldApi = {
  create: (campaignId: number, stageId: number, body: FieldInput) =>
    unwrap<StageField>(api.post(`/campaigns/${campaignId}/stages/${stageId}/fields`, body)),
  update: (campaignId: number, stageId: number, fieldId: number, body: FieldInput) =>
    unwrap<StageField>(api.put(`/campaigns/${campaignId}/stages/${stageId}/fields/${fieldId}`, body)),
  remove: (campaignId: number, stageId: number, fieldId: number) =>
    api.delete(`/campaigns/${campaignId}/stages/${stageId}/fields/${fieldId}`),
  reorder: (campaignId: number, stageId: number, fieldIds: number[]) =>
    unwrap<{ message: string }>(
      api.put(`/campaigns/${campaignId}/stages/${stageId}/fields/reorder`, { field_ids: fieldIds }),
    ),
}

// --- Composite unique constraints ---
export const constraintApi = {
  create: (campaignId: number, stageId: number, fieldKeys: string[]) =>
    unwrap<StageUniqueConstraint>(
      api.post(`/campaigns/${campaignId}/stages/${stageId}/constraints`, { field_keys: fieldKeys }),
    ),
  remove: (campaignId: number, stageId: number, constraintId: number) =>
    api.delete(`/campaigns/${campaignId}/stages/${stageId}/constraints/${constraintId}`),
}

// --- Records & data flow ---
export const recordApi = {
  list: (
    campaignId: number,
    params?: { stage?: number; status?: string; mine?: boolean; page?: number; per_page?: number },
  ) => unwrap<PaginatedRecords>(api.get(`/campaigns/${campaignId}/records`, { params })),
  create: (campaignId: number) =>
    unwrap<RecordRow>(api.post(`/campaigns/${campaignId}/records`, {})),
  remove: (campaignId: number, recordId: number) =>
    api.delete(`/campaigns/${campaignId}/records/${recordId}`),
  form: (campaignId: number, recordId: number) =>
    unwrap<RecordFormData>(api.get(`/campaigns/${campaignId}/records/${recordId}/values`)),
  saveValues: (campaignId: number, recordId: number, values: Record<string, string[]>) =>
    unwrap<{ record: RecordRow; values: Record<string, string[]> }>(
      api.put(`/campaigns/${campaignId}/records/${recordId}/values`, { values }),
    ),
  markProcessing: (campaignId: number, recordId: number) =>
    unwrap<RecordRow>(api.post(`/campaigns/${campaignId}/records/${recordId}/processing`, {})),
  release: (campaignId: number, recordId: number) =>
    unwrap<RecordRow>(api.post(`/campaigns/${campaignId}/records/${recordId}/release`, {})),
  advance: (campaignId: number, recordId: number, note?: string) =>
    unwrap<RecordRow>(api.post(`/campaigns/${campaignId}/records/${recordId}/advance`, { note })),
  history: (campaignId: number, recordId: number) =>
    unwrap<RecordHistory>(api.get(`/campaigns/${campaignId}/records/${recordId}/history`)),
  bulkImport: (campaignId: number, values: string[]) =>
    unwrap<BulkImportResult>(api.post(`/campaigns/${campaignId}/records/bulk`, { values })),
}

// --- Analytics ---
export const analyticsApi = {
  get: (campaignId: number) =>
    unwrap<Analytics>(api.get(`/campaigns/${campaignId}/analytics`)),
}
