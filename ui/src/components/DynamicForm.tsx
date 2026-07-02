import { facebookUrlPlaceholder, parseOptions, type StageField } from '../api/types'

export type FormValues = Record<string, string[]>

/**
 * DynamicForm renders a set of inputs derived from a stage's field definitions.
 * It handles repeatable entries (max_count), choice options, boolean/date/number
 * inputs, and marks fields inherited from a previous stage (prev_stage_key).
 */
export default function DynamicForm({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: StageField[]
  values: FormValues
  onChange: (values: FormValues) => void
  disabled?: boolean
}) {
  const setEntry = (key: string, index: number, value: string) => {
    const entries = [...(values[key] ?? [])]
    entries[index] = value
    onChange({ ...values, [key]: entries })
  }

  const addEntry = (key: string) => {
    onChange({ ...values, [key]: [...(values[key] ?? []), ''] })
  }

  const removeEntry = (key: string, index: number) => {
    const entries = [...(values[key] ?? [])]
    entries.splice(index, 1)
    onChange({ ...values, [key]: entries })
  }

  const setMulti = (key: string, option: string, checked: boolean) => {
    const current = new Set(values[key] ?? [])
    if (checked) current.add(option)
    else current.delete(option)
    onChange({ ...values, [key]: [...current] })
  }

  return (
    <div>
      {fields.map((field) => {
        const entries = values[field.key] ?? ['']
        const options = parseOptions(field)
        const canAddMore = field.max_count === 0 || entries.length < field.max_count
        const repeatable = field.type !== 'multiselect' && field.max_count !== 1
        // Inherited fields are seeded from the previous stage and are read-only.
        const fieldDisabled = disabled || field.prev_stage_key !== ''

        return (
          <div className="field" key={field.id}>
            <label>
              {field.label}
              {field.required && <span className="tag req" style={{ marginLeft: 6 }}>required</span>}
              {field.is_unique && <span className="tag unique" style={{ marginLeft: 6 }}>unique</span>}
              {field.prev_stage_key && <span className="tag inherit" style={{ marginLeft: 6 }}>inherited</span>}
            </label>

            {field.type === 'multiselect' ? (
              <div className="row wrap">
                {options.map((opt) => (
                  <label key={opt} className="inline">
                    <input
                      type="checkbox"
                      disabled={fieldDisabled}
                      checked={(values[field.key] ?? []).includes(opt)}
                      onChange={(e) => setMulti(field.key, opt, e.target.checked)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            ) : (
              <>
                {entries.map((val, i) => (
                  <div className="entry-row" key={i}>
                    <SingleInput
                      field={field}
                      value={val}
                      options={options}
                      disabled={fieldDisabled}
                      onChange={(v) => setEntry(field.key, i, v)}
                    />
                    {repeatable && entries.length > 1 && !fieldDisabled && (
                      <button className="btn ghost sm" onClick={() => removeEntry(field.key, i)}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {repeatable && canAddMore && !fieldDisabled && (
                  <button className="btn sm" onClick={() => addEntry(field.key)}>
                    + Add another
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SingleInput({
  field,
  value,
  options,
  disabled,
  onChange,
}: {
  field: StageField
  value: string
  options: string[]
  disabled?: boolean
  onChange: (v: string) => void
}) {
  switch (field.type) {
    case 'textarea':
      return <textarea value={value} disabled={disabled} rows={2} onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return <input type="number" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    case 'date':
      return <input type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    case 'facebook_profile':
    case 'facebook_group':
    case 'facebook_page':
      return (
        <input
          type="url"
          value={value}
          disabled={disabled}
          placeholder={facebookUrlPlaceholder(field.type)}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'boolean':
      return (
        <label className="inline">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          />
          Yes
        </label>
      )
    case 'select':
      return (
        <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">— select —</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    default:
      return <input type="text" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  }
}
