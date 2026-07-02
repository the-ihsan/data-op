import { useEffect, useRef, useState, type ReactNode } from 'react'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge, type Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index'
import type { StageField } from '@/api/types'
import { cn } from '@/lib/utils'
import FieldCard from './FieldCard'

const FIELD_DRAG_TYPE = 'stage-field'

type FieldDragData = {
  type: typeof FIELD_DRAG_TYPE
  fieldId: number
  index: number
}

function DraggableFieldRow({
  field,
  index,
  disabled,
  isDeleting,
  onEdit,
  onDelete,
}: {
  field: StageField
  index: number
  disabled?: boolean
  isDeleting?: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const dragHandleRef = useRef<HTMLButtonElement>(null)
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const row = rowRef.current
    const handle = dragHandleRef.current
    if (!row || !handle) return

    return combine(
      draggable({
        element: row,
        dragHandle: handle,
        canDrag: () => !disabled,
        getInitialData: (): FieldDragData => ({
          type: FIELD_DRAG_TYPE,
          fieldId: field.id,
          index,
        }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: row,
        canDrop: ({ source }) => {
          const data = source.data as Partial<FieldDragData>
          return data.type === FIELD_DRAG_TYPE && data.fieldId !== field.id
        },
        getData: ({ input, element }) =>
          attachClosestEdge(
            { type: FIELD_DRAG_TYPE, fieldId: field.id, index } satisfies FieldDragData,
            { input, element, allowedEdges: ['top', 'bottom'] },
          ),
        onDrag: ({ self, source }) => {
          const data = source.data as Partial<FieldDragData>
          if (data.fieldId === field.id) {
            setClosestEdge(null)
            return
          }
          setClosestEdge(extractClosestEdge(self.data))
        },
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    )
  }, [disabled, field.id, index])

  return (
    <div
      ref={rowRef}
      className={cn(
        'relative rounded-lg transition-opacity',
        dragging && 'opacity-40',
        closestEdge === 'top' && 'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:rounded-full before:bg-primary',
        closestEdge === 'bottom' && 'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary',
      )}
    >
      <FieldCard
        field={field}
        dragHandleRef={dragHandleRef}
        isDeleting={isDeleting}
        disabled={disabled}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
}

export default function DraggableFieldList({
  fields,
  disabled,
  deletingFieldId,
  editingFieldId,
  renderEditor,
  onReorder,
  onEdit,
  onDelete,
}: {
  fields: StageField[]
  disabled?: boolean
  deletingFieldId?: number | null
  editingFieldId?: number | null
  renderEditor?: (field: StageField) => ReactNode
  onReorder: (fieldIds: number[]) => void
  onEdit: (fieldId: number) => void
  onDelete: (field: StageField) => void
}) {
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => (source.data as Partial<FieldDragData>).type === FIELD_DRAG_TYPE,
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0]
        if (!target) return

        const sourceData = source.data as FieldDragData
        const targetData = target.data as FieldDragData
        if (sourceData.type !== FIELD_DRAG_TYPE || targetData.type !== FIELD_DRAG_TYPE) return

        const startIndex = fields.findIndex((f) => f.id === sourceData.fieldId)
        const indexOfTarget = fields.findIndex((f) => f.id === targetData.fieldId)
        if (startIndex < 0 || indexOfTarget < 0) return

        const finishIndex = getReorderDestinationIndex({
          startIndex,
          indexOfTarget,
          closestEdgeOfTarget: extractClosestEdge(target.data),
          axis: 'vertical',
        })
        if (finishIndex === startIndex) return

        const next = [...fields]
        const [moved] = next.splice(startIndex, 1)
        next.splice(finishIndex, 0, moved)
        onReorder(next.map((f) => f.id))
      },
    })
  }, [fields, onReorder])

  return (
    <div className="space-y-2">
      {fields.map((field, index) =>
        editingFieldId === field.id && renderEditor ? (
          <div key={field.id}>{renderEditor(field)}</div>
        ) : (
          <DraggableFieldRow
            key={field.id}
            field={field}
            index={index}
            disabled={disabled}
            isDeleting={deletingFieldId === field.id}
            onEdit={() => onEdit(field.id)}
            onDelete={() => onDelete(field)}
          />
        ),
      )}
    </div>
  )
}
