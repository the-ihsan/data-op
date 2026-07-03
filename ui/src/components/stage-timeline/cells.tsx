import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { parseOptions, type StageField } from '../../api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NONE } from './helpers'

export function GridCell({
  field,
  value,
  disabled,
  placeholder,
  saveOnBlur,
  inputRef,
  onEnter,
  onChange,
  onCommit,
}: {
  field: StageField
  value: string[]
  disabled?: boolean
  placeholder?: string
  saveOnBlur?: boolean
  inputRef?: (el: HTMLElement | null) => void
  onEnter?: () => void
  onChange: (value: string[], commit?: boolean) => void
  onCommit: () => void
}) {
  const options = parseOptions(field)
  const first = value[0] ?? ''
  // Preserve any additional repeatable entries when editing the first cell inline.
  const setFirst = (v: string) => {
    const rest = value.slice(1)
    onChange(v === '' && rest.length === 0 ? [] : [v, ...rest])
  }

  // Repeatable scalar fields (max_count 0 = unlimited, or > 1) get a popover
  // editor so every entry can be added, edited and removed.
  if (field.max_count !== 1 && !['select', 'multiselect', 'boolean'].includes(field.type)) {
    return (
      <MultiEntryCell
        field={field}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={onChange}
        onCommit={onCommit}
      />
    )
  }

  switch (field.type) {
    case 'boolean':
      return (
        <input
          ref={inputRef as (el: HTMLInputElement | null) => void}
          type="checkbox"
          className="mx-2 size-4 accent-primary"
          disabled={disabled}
          checked={first === 'true'}
          onChange={(e) => onChange([e.target.checked ? 'true' : 'false'], true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onEnter?.()
            }
          }}
        />
      )
    case 'select':
      return (
        <Select
          disabled={disabled}
          value={first === '' ? NONE : first}
          onValueChange={(v) => onChange(v === NONE ? [] : [v], true)}
        >
          <SelectTrigger
            ref={inputRef as (el: HTMLButtonElement | null) => void}
            size="sm"
            className="w-full border-transparent bg-transparent shadow-none hover:bg-muted focus:bg-card"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onEnter?.()
              }
            }}
          >
            <SelectValue placeholder={placeholder ?? '—'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'multiselect':
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button
              ref={inputRef as (el: HTMLButtonElement | null) => void}
              className="w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onEnter?.()
                }
              }}
            >
              {value.length ? value.join(', ') : <span className="text-muted-foreground">{placeholder ?? '—'}</span>}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {options.map((o) => (
              <DropdownMenuCheckboxItem
                key={o}
                checked={value.includes(o)}
                onCheckedChange={(checked) => {
                  const next = checked ? [...value, o] : value.filter((x) => x !== o)
                  onChange(next, true)
                }}
              >
                {o}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    case 'number':
      return (
        <CellInput type="number" value={first} disabled={disabled} placeholder={placeholder}
          saveOnBlur={saveOnBlur} inputRef={inputRef} onEnter={onEnter}
          onChange={setFirst} onCommit={onCommit} />
      )
    case 'date':
      return (
        <CellInput type="date" value={first} disabled={disabled} placeholder={placeholder}
          saveOnBlur={saveOnBlur} inputRef={inputRef} onEnter={onEnter}
          onChange={setFirst} onCommit={onCommit} />
      )
    case 'textarea':
      return (
        <CellTextarea
          value={first}
          disabled={disabled}
          placeholder={placeholder}
          saveOnBlur={saveOnBlur}
          inputRef={inputRef}
          onChange={setFirst}
          onCommit={onCommit}
        />
      )
    default:
      return (
        <CellInput type="text" value={first} disabled={disabled} placeholder={placeholder}
          saveOnBlur={saveOnBlur} inputRef={inputRef} onEnter={onEnter}
          onChange={setFirst} onCommit={onCommit} />
      )
  }
}

/** Popover editor for repeatable fields: one input per entry, add/remove rows.
 * Values are saved when the popover closes. */
function MultiEntryCell({
  field,
  value,
  disabled,
  placeholder,
  onChange,
  onCommit,
}: {
  field: StageField
  value: string[]
  disabled?: boolean
  placeholder?: string
  onChange: (value: string[]) => void
  onCommit: () => void
}) {
  const [open, setOpen] = useState(false)
  const entries = value.length > 0 ? value : ['']
  const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'
  const isTextarea = field.type === 'textarea'
  const limit = field.max_count // 0 = unlimited
  const canAdd = limit === 0 || entries.length < limit
  const filled = value.filter((v) => v.trim() !== '')

  const setEntry = (i: number, v: string) => {
    const next = [...entries]
    next[i] = v
    onChange(next)
  }
  const removeEntry = (i: number) => {
    onChange(entries.filter((_, j) => j !== i))
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) onCommit()
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          className="flex h-8 w-full items-center gap-1 rounded px-2 text-left text-sm hover:bg-muted disabled:opacity-50"
          disabled={disabled}
        >
          <span className="min-w-0 flex-1 truncate">
            {filled.length > 0 ? (
              filled.join(', ')
            ) : (
              <span className="text-muted-foreground">{placeholder ?? '—'}</span>
            )}
          </span>
          {filled.length > 1 && (
            <Badge variant="secondary" className="shrink-0">
              {filled.length}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="flex flex-col gap-1.5">
          {entries.map((v, i) => (
            <div key={i} className="flex items-center gap-1">
              {isTextarea ? (
                <Textarea
                  value={v}
                  autoFocus={i === entries.length - 1}
                  placeholder={`Entry ${i + 1}`}
                  rows={2}
                  onChange={(e) => setEntry(i, e.target.value)}
                  className="min-h-16 resize-none"
                />
              ) : (
                <Input
                  type={inputType}
                  value={v}
                  autoFocus={i === entries.length - 1}
                  placeholder={`Entry ${i + 1}`}
                  onChange={(e) => setEntry(i, e.target.value)}
                  className="h-8"
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground"
                onClick={() => removeEntry(i)}
              >
                <X />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={!canAdd} onClick={() => onChange([...entries, ''])}>
            <Plus /> Add entry{limit > 0 && ` (${entries.length}/${limit})`}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function CellTextarea({
  value,
  disabled,
  placeholder,
  saveOnBlur,
  inputRef,
  onChange,
  onCommit,
}: {
  value: string
  disabled?: boolean
  placeholder?: string
  saveOnBlur?: boolean
  inputRef?: (el: HTMLElement | null) => void
  onChange: (v: string) => void
  onCommit: () => void
}) {
  return (
    <Textarea
      ref={inputRef as (el: HTMLTextAreaElement | null) => void}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      rows={2}
      onChange={(e) => onChange(e.target.value)}
      onBlur={saveOnBlur ? onCommit : undefined}
      className="min-h-16 resize-none border-transparent bg-transparent shadow-none hover:bg-muted focus-visible:bg-card focus-visible:ring-1"
    />
  )
}

function CellInput({
  type,
  value,
  disabled,
  placeholder,
  saveOnBlur,
  inputRef,
  onEnter,
  onChange,
  onCommit,
}: {
  type: string
  value: string
  disabled?: boolean
  placeholder?: string
  saveOnBlur?: boolean
  inputRef?: (el: HTMLElement | null) => void
  onEnter?: () => void
  onChange: (v: string) => void
  onCommit: () => void
}) {
  return (
    <Input
      ref={inputRef as (el: HTMLInputElement | null) => void}
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={saveOnBlur ? onCommit : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          if (onEnter) onEnter()
          else onCommit()
        }
      }}
      className="h-8 border-transparent bg-transparent shadow-none hover:bg-muted focus-visible:bg-card focus-visible:ring-1"
    />
  )
}
