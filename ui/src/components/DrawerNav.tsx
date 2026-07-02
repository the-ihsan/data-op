import { Link } from 'react-router-dom'
import { ArrowLeft, Menu } from 'lucide-react'
import type { Campaign } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type DrawerNavProps<T extends string> = {
  campaign: Campaign
  tabs: { key: T; label: string }[]
  tab: T
  onTabChange: (key: T) => void
}

export default function DrawerNav<T extends string>({
  campaign,
  tabs,
  tab,
  onTabChange,
}: DrawerNavProps<T>) {
  const tabButtonClass = (key: T) =>
    cn(
      'rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
      tab === key
        ? 'bg-accent font-semibold text-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )

  return (
    <>
      <Link
        to="/"
        className="muted hidden shrink-0 drawer-nav:inline-flex"
        title="Back to campaigns"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <span className="hidden min-w-0 truncate font-semibold text-foreground drawer-nav:inline">
        {campaign.name}
      </span>
      <span className="badge hidden shrink-0 drawer-nav:inline">{campaign.status}</span>
      <span className="tag hidden shrink-0 drawer-nav:inline">
        {campaign.allow_concurrent_edit ? 'concurrent editing' : 'record locking'}
      </span>
      <nav className="ml-2 hidden min-w-0 items-center gap-1 drawer-nav:flex">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => onTabChange(t.key)} className={tabButtonClass(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            className="ml-auto shrink-0 drawer-nav:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(20rem,85vw)] gap-0 p-0">
          <SheetHeader className="border-b p-4 text-left">
            <Link
              to="/"
              className="muted mb-2 inline-flex items-center gap-1.5 text-sm"
              title="Back to campaigns"
            >
              <ArrowLeft className="size-4" />
              Campaigns
            </Link>
            <SheetTitle>{campaign.name}</SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              <span className="badge">{campaign.status}</span>
              <span className="tag">
                {campaign.allow_concurrent_edit ? 'concurrent editing' : 'record locking'}
              </span>
            </SheetDescription>
          </SheetHeader>
          <nav className="flex flex-col gap-1 p-2">
            {tabs.map((t) => (
              <SheetTrigger key={t.key} asChild>
                <button
                  onClick={() => onTabChange(t.key)}
                  className={cn(tabButtonClass(t.key), 'w-full px-4 py-2.5 text-left')}
                >
                  {t.label}
                </button>
              </SheetTrigger>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
