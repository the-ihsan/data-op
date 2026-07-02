import { Loader2 } from 'lucide-react'

export default function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
