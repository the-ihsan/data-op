import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { constraintApi } from '@/api/resources'
import type { Stage } from '@/api/types'
import { Button } from '@/components/ui/button'

export default function ConstraintSection({
  campaignId,
  stage,
  onChange,
}: {
  campaignId: number
  stage: Stage
  onChange: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const fields = stage.fields ?? []

  const add = useMutation({
    mutationFn: () => constraintApi.create(campaignId, stage.id, selected),
    onSuccess: () => {
      setSelected([])
      onChange()
    },
  })

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))

  return (
    <section className="rounded-lg border bg-muted/20 p-4">
      <h4 className="m-0 mb-2 text-sm font-semibold text-foreground">Composite unique constraint</h4>
      <p className="mb-3 text-xs text-muted-foreground">Pick two or more fields that must be unique together.</p>
      <div className="flex flex-wrap items-center gap-3">
        {fields.map((f) => (
          <label key={f.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={selected.includes(f.key)}
              disabled={add.isPending}
              onChange={() => toggle(f.key)}
            />
            {f.label}
          </label>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={selected.length < 2 || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Adding…
            </>
          ) : (
            'Add constraint'
          )}
        </Button>
      </div>
      {add.error && <p className="mt-2 text-sm text-destructive">{(add.error as Error).message}</p>}
    </section>
  )
}
