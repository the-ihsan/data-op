import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { authApi } from '../api/resources'
import { useAuth } from '../auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      authApi.updateMe({
        name: name.trim(),
        email: email.trim(),
        ...(newPassword !== ''
          ? { current_password: currentPassword, new_password: newPassword }
          : {}),
      }),
    onSuccess: (u) => {
      updateUser(u)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError(null)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    },
    onError: (e) => {
      setSaved(false)
      setError((e as Error).message)
    },
  })

  if (!user) return null

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim() === '') {
      setError('Name is required')
      return
    }
    if (newPassword !== '') {
      if (newPassword.length < 6) {
        setError('New password must be at least 6 characters')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('New password and confirmation do not match')
        return
      }
      if (currentPassword === '') {
        setError('Enter your current password to change it')
        return
      }
    }
    setError(null)
    save.mutate()
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <h2 className="mb-1 text-lg font-semibold text-foreground">Profile</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Update your account details. Leave the password fields empty to keep your
        current password.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="profile-username">Username</label>
          <Input id="profile-username" value={user.username} disabled />
          <p className="text-xs text-muted-foreground">Usernames cannot be changed.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="profile-name">Name</label>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="profile-email">Email</label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="mt-2 border-t pt-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Change password</h3>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="profile-current-password">
                Current password
              </label>
              <Input
                id="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="profile-new-password">
                New password
              </label>
              <Input
                id="profile-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="profile-confirm-password">
                Confirm new password
              </label>
              <Input
                id="profile-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <Check className="size-4" /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
