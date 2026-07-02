import { GripVertical, Loader2, Pencil, Trash2 } from 'lucide-react'
import { parseOptions, type StageField } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FIELD_TYPE_LABELS } from './constants'

export default function FieldCard({
  field,
  isDeleting,
  disabled,
  onEdit,
  onDelete,
}: {
  field: StageField
  isDeleting?: boolean
  disabled?: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const options = parseOptions(field)
  const inherited = field.prev_stage_key !== ''
  const hasData = (field.value_count ?? 0) > 0

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-lg border bg-background px-3 py-3 transition-colors hover:border-primary/30',
        isDeleting && 'opacity-60',
      )}
    >
      <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{field.label}</span>
          <Badge variant="outline" className="font-normal">
            {FIELD_TYPE_LABELS[field.type] ?? field.type}
          </Badge>
          {field.required && <Badge variant="secondary">Required</Badge>}
          {field.is_unique && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Unique</Badge>}
          {inherited && (
            <Badge variant="secondary" className="gap-1">
              Inherited from {field.prev_stage_key}
            </Badge>
          )}
          {field.max_count !== 1 && (
            <Badge variant="outline">
              Multiple{field.max_count > 0 ? ` · max ${field.max_count}` : ' · unlimited'}
            </Badge>
          )}
          {field.default_value && (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Default: {field.default_value}
            </Badge>
          )}
          {hasData && (
            <Badge variant="outline" className="text-muted-foreground">
              {field.value_count} value{(field.value_count ?? 0) === 1 ? '' : 's'} stored
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Key: <code className="rounded bg-muted px-1 py-0.5 font-mono">{field.key}</code>
          {options.length > 0 && (
            <>
              {' '}
              · Options: {options.join(', ')}
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <Button variant="ghost" size="icon-sm" disabled={disabled || isDeleting} onClick={onEdit} aria-label="Edit field">
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          disabled={disabled || isDeleting}
          onClick={onDelete}
          aria-label="Delete field"
        >
          {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
    </div>
  )
}
