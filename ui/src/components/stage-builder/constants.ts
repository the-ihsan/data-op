import type { FieldType } from '@/api/types'

export const FIELD_TYPES: FieldType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  textarea: 'Long text',
  number: 'Number',
  date: 'Date',
  boolean: 'Yes / No',
  select: 'Single choice',
  multiselect: 'Multiple choice',
}

export const SANITIZE_PLACEHOLDER = `# Runs before each entry is saved at this stage.
# data is a dict keyed by field key (multi-entry fields are lists).
def sanitize(data):
    data["email"] = data.get("email", "").lower()
    return data  # or: return None, "error message" to reject`

export const GUIDE_EXAMPLE = `def sanitize(data):
    # lowercase an email field
    data["email"] = data.get("email", "").lower()

    # canonicalize a facebook profile, rejecting bad links
    v, err = fb_profile(data.get("profile", ""))
    if err != None:
        return None, "profile: " + err
    data["profile"] = v

    return data`

export const GUIDE_BUILTINS: { sig: string; desc: string }[] = [
  { sig: 'fb_profile(value)', desc: 'Canonical Facebook profile URL (username, profile.php?id=…, /people/… links).' },
  { sig: 'fb_group(value)', desc: 'Canonical Facebook group URL (slug, numeric id, group.php?gid=… links).' },
  { sig: 'fb_page(value)', desc: 'Canonical Facebook page URL (vanity name or /pages/…/id links).' },
]
