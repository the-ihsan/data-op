//go:build js && wasm

// WASM entry for browser-side Starlark sanitize script validation.
// Exposes goSanitizeValidate(script) → { valid: bool, error?: string }.
package main

import (
	"strings"
	"syscall/js"

	"goravel/app/services/starlark"
)

func main() {
	validateFn := js.FuncOf(validate)
	defer validateFn.Release()
	js.Global().Set("goSanitizeValidate", validateFn)
	if ready := js.Global().Get("__sanitizeWasmReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}
	select {}
}

func validate(_ js.Value, args []js.Value) any {
	if len(args) == 0 {
		return js.ValueOf(map[string]any{"valid": false, "error": "missing script argument"})
	}
	script := strings.TrimSpace(args[0].String())
	if script == "" {
		return js.ValueOf(map[string]any{"valid": true})
	}
	if err := starlark.Validate(script); err != nil {
		return js.ValueOf(map[string]any{"valid": false, "error": err.Error()})
	}
	return js.ValueOf(map[string]any{"valid": true})
}
