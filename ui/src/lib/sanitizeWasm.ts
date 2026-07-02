export type SanitizeValidation = { valid: true } | { valid: false; error: string }

declare global {
  interface Window {
    Go?: new () => GoRuntime
    goSanitizeValidate?: (script: string) => SanitizeValidation
    __sanitizeWasmReady?: () => void
  }
}

interface GoRuntime {
  importObject: WebAssembly.Imports
  run(instance: WebAssembly.Instance): Promise<void>
}

let loadPromise: Promise<(script: string) => SanitizeValidation> | null = null

function loadWasmExec(): Promise<void> {
  if (window.Go) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-sanitize-wasm-exec]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load wasm_exec.js')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = '/wasm/wasm_exec.js'
    script.dataset.sanitizeWasmExec = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load wasm_exec.js'))
    document.head.appendChild(script)
  })
}

export function loadSanitizeValidator(): Promise<(script: string) => SanitizeValidation> {
  if (!loadPromise) {
    loadPromise = (async () => {
      await loadWasmExec()
      if (!window.Go) {
        throw new Error('Go WASM runtime not available')
      }
      const go = new window.Go()
      const response = await fetch('/wasm/sanitize.wasm')
      if (!response.ok) {
        throw new Error(`Failed to fetch sanitize.wasm (${response.status})`)
      }
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error('WASM module did not become ready in time'))
        }, 15_000)
        window.__sanitizeWasmReady = () => {
          window.clearTimeout(timeout)
          resolve()
        }
        void WebAssembly.instantiateStreaming(response, go.importObject)
          .then(({ instance }) => {
            void go.run(instance)
          })
          .catch((err) => {
            window.clearTimeout(timeout)
            reject(err)
          })
      })
      const validate = window.goSanitizeValidate
      if (!validate) {
        throw new Error('goSanitizeValidate was not registered by WASM module')
      }
      return validate
    })()
  }
  return loadPromise
}
