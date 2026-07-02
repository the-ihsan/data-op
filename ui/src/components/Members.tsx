import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { memberApi, userApi } from '../api/resources'
import type { CampaignMember, Role, User } from '../api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { cn } from '@/lib/utils'

export default function Members({ campaignId }: { campaignId: number }) {
  const qc = useQueryClient()
  const { data: members, isLoading } = useQuery({
    queryKey: ['members', campaignId],
    queryFn: () => memberApi.list(campaignId),
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['members', campaignId] })

  const [selected, setSelected] = useState<User[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const focusSearch = () => {
    pickerRef.current
      ?.querySelector<HTMLInputElement>('[data-slot="input-group-control"]')
      ?.focus()
    setPickerOpen(true)
  }

  const [role, setRole] = useState<Role>('member')
  const [perms, setPerms] = useState({ can_add: true, can_edit: true, can_delete: false })

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const memberUserIds = useMemo(
    () => new Set(members?.map((m) => m.user_id) ?? []),
    [members],
  )
  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected])

  const { data: searchResults, isFetching: searchLoading } = useQuery({
    queryKey: ['users', 'search', debouncedQuery],
    queryFn: () => userApi.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  })

  const suggestions = useMemo(
    () =>
      (searchResults ?? []).filter(
        (u) => !memberUserIds.has(u.id) && !selectedIds.has(u.id),
      ),
    [searchResults, memberUserIds, selectedIds],
  )

  const toggleUser = (user: User) => {
    setSelected((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user],
    )
    setQuery('')
    setDebouncedQuery('')
  }

  const removeSelected = (userId: number) => {
    setSelected((prev) => prev.filter((u) => u.id !== userId))
  }

  const add = useMutation({
    mutationFn: async (users: User[]) => {
      const results = await Promise.allSettled(
        users.map((u) =>
          memberApi.add(campaignId, { username: u.username, role, ...perms }),
        ),
      )
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
      const succeeded = results.length - failed.length
      if (failed.length > 0) {
        const detail = failed
          .map((r) => (r.reason instanceof Error ? r.reason.message : 'unknown error'))
          .join('; ')
        throw new Error(
          succeeded > 0
            ? `Added ${succeeded}, failed ${failed.length}: ${detail}`
            : detail,
        )
      }
    },
    onSuccess: () => {
      setSelected([])
      setQuery('')
      setPickerOpen(false)
      invalidate()
    },
  })

  const update = useMutation({
    mutationFn: (m: CampaignMember) =>
      memberApi.update(campaignId, m.id, {
        role: m.role,
        can_add: m.can_add,
        can_edit: m.can_edit,
        can_delete: m.can_delete,
      }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => memberApi.remove(campaignId, id),
    onSuccess: invalidate,
  })

  if (isLoading) return <p className="muted">Loading…</p>

  const showDropdown = pickerOpen && debouncedQuery.length >= 2

  return (
    <div>
      <div className="panel">
        <h3>Add members</h3>
        <div className="field">
          <label>Search users</label>
          <div
            ref={pickerRef}
            className={cn(
              'overflow-hidden rounded-md border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
              pickerOpen && 'border-ring ring-[3px] ring-ring/50',
            )}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) return
              focusSearch()
            }}
          >
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-input px-2 py-2">
                {selected.map((u) => (
                  <Badge key={u.id} variant="secondary" className="gap-1 pr-1">
                    <span>{u.name}</span>
                    <span className="text-muted-foreground">@{u.username}</span>
                    <button
                      type="button"
                      className="ml-0.5 rounded-sm p-0.5 hover:bg-accent"
                      aria-label={`Remove ${u.username}`}
                      onClick={() => removeSelected(u.id)}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <InputGroup className="h-9 rounded-none border-0 bg-transparent shadow-none dark:bg-transparent has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0">
              <InputGroupInput
                value={query}
                placeholder="Search by name or username…"
                className="rounded-none border-0 bg-transparent shadow-none"
                onFocus={() => setPickerOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPickerOpen(true)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setPickerOpen(false)
                  }
                }}
              />
              <InputGroupAddon align="inline-start">
                <Search />
              </InputGroupAddon>
            </InputGroup>
            {showDropdown && (
              <div className="max-h-52 overflow-y-auto border-t border-input p-1">
                {searchLoading ? (
                  <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Searching…
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-muted-foreground">No users found.</p>
                ) : (
                  suggestions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => toggleUser(u)}
                    >
                      <span>{u.name}</span>
                      <span className="text-xs text-muted-foreground">@{u.username}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
            Type at least 2 characters, then click to select. Add multiple users with the same role and permissions.
          </p>
        </div>
        <div className="row wrap">
          <div className="field" style={{ width: 130 }}>
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">Member</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>
        <div className="row wrap">
          <label className="inline">
            <input type="checkbox" checked={perms.can_add} onChange={(e) => setPerms({ ...perms, can_add: e.target.checked })} /> Add
          </label>
          <label className="inline">
            <input type="checkbox" checked={perms.can_edit} onChange={(e) => setPerms({ ...perms, can_edit: e.target.checked })} /> Edit
          </label>
          <label className="inline">
            <input type="checkbox" checked={perms.can_delete} onChange={(e) => setPerms({ ...perms, can_delete: e.target.checked })} /> Delete
          </label>
          <div className="spacer" />
          <Button
            disabled={selected.length === 0 || add.isPending}
            onClick={() => add.mutate(selected)}
          >
            {add.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Adding…
              </>
            ) : selected.length <= 1 ? (
              'Add member'
            ) : (
              `Add ${selected.length} members`
            )}
          </Button>
        </div>
        {add.error && <div className="error" style={{ marginTop: '0.5rem' }}>{add.error.message}</div>}
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Add</th>
              <th>Edit</th>
              <th>Delete</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members?.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.user?.name ?? `#${m.user_id}`}
                  <br />
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    @{m.user?.username}
                  </span>
                </td>
                <td>
                  {m.role === 'owner' ? <span className="badge">owner</span> : m.role}
                </td>
                {(['can_add', 'can_edit', 'can_delete'] as const).map((p) => (
                  <td key={p}>
                    <input
                      type="checkbox"
                      disabled={m.role === 'owner'}
                      checked={m.role === 'owner' ? true : m[p]}
                      onChange={(e) => update.mutate({ ...m, [p]: e.target.checked })}
                    />
                  </td>
                ))}
                <td>
                  {m.role !== 'owner' && (
                    <button className="btn danger sm" onClick={() => remove.mutate(m.id)}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {update.error && <div className="error" style={{ marginTop: '0.5rem' }}>{update.error.message}</div>}
      </div>
    </div>
  )
}
