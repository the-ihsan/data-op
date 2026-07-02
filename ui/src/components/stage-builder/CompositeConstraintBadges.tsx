import type { UseMutationResult } from '@tanstack/react-query'
import { Loader2, X } from 'lucide-react'
import { parseFieldKeys, type StageUniqueConstraint } from '@/api/types'
import { Badge } from '@/components/ui/badge'

export default function CompositeConstraintBadges({
  constraints,
  removeConstraint,
}: {
  constraints: StageUniqueConstraint[]
  removeConstraint: UseMutationResult<unknown, Error, number, unknown>
}) {
  if (constraints.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Composite unique:</span>
      {constraints.map((c) => (
        <Badge key={c.id} variant="secondary" className="gap-1">
          {parseFieldKeys(c).join(' + ')}
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-muted disabled:opacity-50"
            disabled={removeConstraint.isPending}
            onClick={() => removeConstraint.mutate(c.id)}
            aria-label="Remove constraint"
          >
            {removeConstraint.isPending && removeConstraint.variables === c.id ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <X className="size-3" />
            )}
          </button>
        </Badge>
      ))}
    </div>
  )
}
