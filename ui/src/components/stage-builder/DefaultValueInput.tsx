import type { FieldType } from '@/api/types'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function DefaultValueInput({
  type,
  options,
  value,
  onChange,
}: {
  type: FieldType
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  switch (type) {
    case 'boolean':
      return (
        <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="No default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No default</SelectItem>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'select':
      return (
        <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="No default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No default</SelectItem>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'multiselect':
      return (
        <Input
          value={value}
          placeholder="Comma-separated options, e.g. a, b"
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'date':
      return <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    case 'textarea':
      return (
        <textarea
          className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={value}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    default:
      return <Input value={value} placeholder="Optional default" onChange={(e) => onChange(e.target.value)} />
  }
}
