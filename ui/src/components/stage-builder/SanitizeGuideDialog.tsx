import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { GUIDE_BUILTINS, GUIDE_EXAMPLE } from './constants'

function GuideCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em] text-foreground">
      {children}
    </code>
  )
}

function GuideSection({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-lg border bg-card p-4', className)}>
      <h4 className="mb-2 text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  )
}

export default function SanitizeGuideDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title="Sanitize script guide"
          aria-label="Sanitize script guide"
        >
          <CircleHelp />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Sanitize entry scripts</DialogTitle>
          <DialogDescription>
            Starlark (a Python dialect) runs on every value save and bulk-import line at this
            stage, before validation and persistence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4 text-sm">
          <GuideSection title="Input and output">
            <p className="text-muted-foreground">
              Define <GuideCode>def sanitize(data)</GuideCode>. <GuideCode>data</GuideCode> is a
              dict keyed by field key — single-entry fields are strings, multi-entry fields are
              lists of strings.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-(--ok)/30 bg-(--ok)/5 p-3">
                <p className="mb-1 text-xs font-medium text-foreground">Accept</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Return the (possibly modified) dict. Values may be strings, numbers, booleans,
                  or lists of those. Set a field to <GuideCode>None</GuideCode> to drop it.
                </p>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-1 text-xs font-medium text-foreground">Reject</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Return <GuideCode>None, "message"</GuideCode>. The message is shown to the user
                  as a 400 error.
                </p>
              </div>
            </div>
          </GuideSection>

          <GuideSection title="Example">
            <pre className="overflow-x-auto rounded-md border bg-muted/60 p-3 font-mono text-xs leading-relaxed text-foreground">
              {GUIDE_EXAMPLE}
            </pre>
          </GuideSection>

          <GuideSection title="Bound functions">
            <p className="mb-3 text-muted-foreground">
              Each takes one string and returns a <GuideCode>(value, error)</GuideCode> pair —
              <GuideCode>(canonical_url, None)</GuideCode> on success or{' '}
              <GuideCode>(None, "message")</GuideCode> on failure.
            </p>
            <dl className="divide-y rounded-md border text-xs">
              {GUIDE_BUILTINS.map((b) => (
                <div key={b.sig} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                  <dt>
                    <code className="font-mono text-foreground">{b.sig}</code>
                  </dt>
                  <dd className="text-muted-foreground">{b.desc}</dd>
                </div>
              ))}
            </dl>
          </GuideSection>

          <GuideSection title="Environment" className="bg-muted/40">
            <ul className="space-y-1.5 text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-foreground" aria-hidden>•</span>
                <span>Sandboxed — no imports, file, network, or OS access.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-foreground" aria-hidden>•</span>
                <span>Execution capped (~1s / bounded steps); infinite loops are aborted.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-foreground" aria-hidden>•</span>
                <span>Compile-checked on save; compiled program is cached in memory.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-foreground" aria-hidden>•</span>
                <span>Not run when advancing seeds inherited values from a previous stage.</span>
              </li>
            </ul>
          </GuideSection>
        </div>

        <DialogFooter className="border-t px-6 py-4" showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
