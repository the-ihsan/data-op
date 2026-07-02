import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { stageApi } from '@/api/resources'
import type { Stage } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SANITIZE_PLACEHOLDER } from './constants'
import SanitizeGuideDialog from './SanitizeGuideDialog'

export default function SanitizeSection({
  campaignId,
  stage,
  onChange,
}: {
  campaignId: number
  stage: Stage
  onChange: () => void
}) {
  const saved = stage.sanitize_entry ?? ''
  const [open, setOpen] = useState(false)
  const [script, setScript] = useState(saved)

  useEffect(() => {
    setScript(saved)
  }, [saved])

  const save = useMutation({
    mutationFn: (value: string) => stageApi.update(campaignId, stage.id, { sanitize_entry: value }),
    onSuccess: onChange,
  })

  return (
    <section className="rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? '▾' : '▸'} Sanitize entry (Starlark)
        </button>
        <SanitizeGuideDialog />
        {saved && <Badge variant="secondary">Active</Badge>}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={SANITIZE_PLACEHOLDER}
            rows={8}
            spellCheck={false}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted-foreground">
            The script must define <code className="rounded bg-muted px-1">sanitize(data)</code>. It receives
            entry values as a dict and returns the sanitized dict, or{' '}
            <code className="rounded bg-muted px-1">None, "message"</code> to reject the entry.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={save.isPending || script === saved} onClick={() => save.mutate(script)}>
              {save.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : (
                'Save script'
              )}
            </Button>
            {saved && (
              <Button
                size="sm"
                variant="destructive"
                disabled={save.isPending}
                onClick={() => {
                  setScript('')
                  save.mutate('')
                }}
              >
                {save.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Removing…
                  </>
                ) : (
                  'Remove'
                )}
              </Button>
            )}
          </div>
          {save.error && (
            <p className="text-sm text-destructive">{(save.error as Error).message}</p>
          )}
        </div>
      )}
    </section>
  )
}
