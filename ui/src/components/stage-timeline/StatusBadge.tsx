import { Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RecordRow } from '../../api/types'

export function StatusBadge({ status, locked }: { status: RecordRow['status']; locked: boolean }) {
  const variant = status === 'finished' ? 'default' : status === 'processing' ? 'secondary' : 'outline'
  return (
    <div className="flex items-center gap-1">
      <Badge variant={variant} className={cn(status === 'finished' && 'bg-(--ok)', status === 'processing' && 'bg-(--warn) text-white')}>
        {status}
      </Badge>
      {locked && <Lock className="size-3.5 text-muted-foreground" aria-label="locked by another user" />}
    </div>
  )
}
