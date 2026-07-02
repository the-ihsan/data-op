import { useEffect, useMemo, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorProps } from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  snippetCompletion,
} from '@codemirror/autocomplete'
import { linter, type Diagnostic } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import type { Text } from '@codemirror/state'
import { loadSanitizeValidator, type SanitizeValidation } from '@/lib/sanitizeWasm'
import { GUIDE_BUILTINS, SANITIZE_PLACEHOLDER } from './constants'

const LOC_RE = /sanitize\.star:(\d+):(\d+):\s*(.+)/

function errorToDiagnostic(doc: Text, error: string): Diagnostic {
  const loc = error.match(LOC_RE)
  const message = loc?.[3] ?? error.replace(/^compile error:\s*/, '')
  if (loc) {
    const line = doc.line(Number(loc[1]))
    const from = line.from + Number(loc[2]) - 1
    return { from, to: Math.min(from + 1, line.to), severity: 'error', message }
  }
  const first = doc.line(1)
  return { from: first.from, to: Math.min(first.from + 1, first.to), severity: 'error', message }
}

function createSanitizeLinter(validate: (script: string) => SanitizeValidation) {
  return linter(
    (view) => {
      const text = view.state.doc.toString().trim()
      if (!text) return []
      const result = validate(text)
      if (result.valid) return []
      return [errorToDiagnostic(view.state.doc, result.error)]
    },
    { delay: 250 },
  )
}

const BUILTIN_OPTIONS: Completion[] = [
  {
    label: 'fb_profile',
    type: 'function',
    detail: GUIDE_BUILTINS[0].desc,
    apply: 'fb_profile(${value})',
  },
  {
    label: 'fb_group',
    type: 'function',
    detail: GUIDE_BUILTINS[1].desc,
    apply: 'fb_group(${value})',
  },
  {
    label: 'fb_page',
    type: 'function',
    detail: GUIDE_BUILTINS[2].desc,
    apply: 'fb_page(${value})',
  },
  snippetCompletion('def sanitize(data):\n    ${}\n    return data', {
    label: 'def sanitize(data)',
    type: 'keyword',
    detail: 'Required entry function',
  }),
  snippetCompletion('return None, "${message}"', {
    label: 'return None, "message"',
    type: 'keyword',
    detail: 'Reject entry with error',
  }),
  { label: 'None', type: 'constant' },
  { label: 'True', type: 'constant' },
  { label: 'False', type: 'constant' },
  {
    label: 'data.get',
    type: 'method',
    detail: 'Read a field value from the entry dict',
    apply: 'data.get("${key}", ${default})',
  },
]

function starlarkCompletions(context: CompletionContext) {
  const word = context.matchBefore(/[\w.]*/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  return {
    from: word.from,
    options: BUILTIN_OPTIONS,
    validFor: /^[\w.]*$/,
  }
}

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '0.875rem',
    borderRadius: 'var(--radius-md, 0.375rem)',
    border: '1px solid var(--input)',
    backgroundColor: 'var(--background)',
    overflow: 'hidden',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: 'var(--ring)',
    boxShadow: '0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent)',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    lineHeight: '1.5',
  },
  '.cm-content': {
    padding: '0.5rem 0.75rem',
    caretColor: 'var(--foreground)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--muted-surface)',
    borderRight: '1px solid var(--border)',
    color: 'var(--muted-foreground)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
  },
  '.cm-lintRange-error': {
    backgroundImage: 'url(\'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 3 l2 -2 l2 2 l2 -2 l2 2" stroke="%23dc2626" fill="none" stroke-width=".7"/></svg>\')',
  },
  '.cm-tooltip.cm-tooltip-lint': {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    color: 'var(--popover-foreground)',
    borderRadius: 'var(--radius-md, 0.375rem)',
  },
  '.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--popover)',
    border: '1px solid var(--border)',
    color: 'var(--popover-foreground)',
  },
})

export default function StarlarkEditor({
  value,
  onChange,
  ...props
}: Omit<ReactCodeMirrorProps, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}) {
  const [validate, setValidate] = useState<((script: string) => SanitizeValidation) | null>(null)
  const [wasmError, setWasmError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadSanitizeValidator()
      .then((fn) => {
        if (!cancelled) setValidate(() => fn)
      })
      .catch((err: Error) => {
        if (!cancelled) setWasmError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const extensions = useMemo(() => {
    const ex = [
      python(),
      editorTheme,
      EditorView.lineWrapping,
      autocompletion({ override: [starlarkCompletions], activateOnTyping: true }),
    ]
    if (validate) ex.push(createSanitizeLinter(validate))
    return ex
  }, [validate])

  return (
    <div className="space-y-1">
      <CodeMirror
        value={value}
        height="200px"
        placeholder={SANITIZE_PLACEHOLDER}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          autocompletion: false,
        }}
        extensions={extensions}
        onChange={onChange}
        {...props}
      />
      {wasmError && (
        <p className="text-xs text-muted-foreground">
          Live validation unavailable ({wasmError}). Save still validates on the server.
        </p>
      )}
    </div>
  )
}
