import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { memberApi } from '../api/resources'
import type { CampaignMember, Role } from '../api/types'

export default function Members({ campaignId }: { campaignId: number }) {
  const qc = useQueryClient()
  const { data: members, isLoading } = useQuery({
    queryKey: ['members', campaignId],
    queryFn: () => memberApi.list(campaignId),
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['members', campaignId] })

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [perms, setPerms] = useState({ can_add: true, can_edit: true, can_delete: false })

  const add = useMutation({
    mutationFn: () => memberApi.add(campaignId, { email, role, ...perms }),
    onSuccess: () => {
      setEmail('')
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

  return (
    <div>
      <div className="panel">
        <h3>Add member</h3>
        <div className="row wrap">
          <div className="field" style={{ flex: 2, minWidth: 180 }}>
            <label>User email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>
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
          <button className="btn primary" disabled={!email.trim()} onClick={() => add.mutate()}>
            Add member
          </button>
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
                    {m.user?.email}
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
