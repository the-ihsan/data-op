import { Link, NavLink } from 'react-router-dom'
import { ArrowLeft, Menu } from 'lucide-react'
import type { Campaign } from '@/api/types'
import { Badge } from '@/components/ui/badge'
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

const NAV_ITEMS = [
  { to: '', label: 'Timeline', end: true },
  { to: 'stages', label: 'Stages & Fields', end: false },
  { to: 'members', label: 'Members', end: false },
  { to: 'analytics', label: 'Analytics', end: false },
  { to: 'settings', label: 'Settings', end: false },
] as const

type CampaignNavProps = {
  campaign: Campaign
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
    isActive
      ? 'bg-accent font-semibold text-foreground'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  )

export default function CampaignNav({ campaign }: CampaignNavProps) {
  const base = `/campaigns/${campaign.id}`

  return (
    <header className="-mx-6 -mt-4 mb-4 shrink-0 border-b bg-card px-6">
      <div className="flex items-center gap-3 py-3">
        <Link
          to="/"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Campaigns</span>
        </Link>

        <div className="h-5 w-px shrink-0 bg-border" aria-hidden />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-base font-semibold text-foreground">{campaign.name}</h1>
          <Badge variant="secondary" className="hidden shrink-0 capitalize sm:inline-flex">
            {campaign.status}
          </Badge>
          <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
            {campaign.allow_concurrent_edit ? 'Concurrent' : 'Record locking'}
          </Badge>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="shrink-0 drawer-nav:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(20rem,85vw)] gap-0 p-0">
            <SheetHeader className="border-b p-4 text-left">
              <SheetTitle>{campaign.name}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {campaign.status}
                </Badge>
                <Badge variant="outline">
                  {campaign.allow_concurrent_edit ? 'Concurrent' : 'Record locking'}
                </Badge>
              </SheetDescription>
            </SheetHeader>
            <nav className="flex flex-col gap-1 p-2">
              {NAV_ITEMS.map((item) => (
                <SheetTrigger key={item.to || 'timeline'} asChild>
                  <NavLink
                    to={item.to ? `${base}/${item.to}` : base}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(navLinkClass({ isActive }), 'w-full px-4 py-2.5 text-left')
                    }
                  >
                    {item.label}
                  </NavLink>
                </SheetTrigger>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>

      <nav className="hidden items-center gap-1 overflow-x-auto pb-2 drawer-nav:flex">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to || 'timeline'}
            to={item.to ? `${base}/${item.to}` : base}
            end={item.end}
            className={navLinkClass}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
