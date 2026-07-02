package starlark

import (
	"sync"

	sl "go.starlark.net/starlark"
)

var (
	regMu    sync.RWMutex
	registry = sl.StringDict{}
)

// RegisterStringNormalizer binds a Go normalizer as a Starlark builtin
// available to every sanitize script. The builtin takes one string argument
// and returns a Go-style (value, error) pair — (canonical, None) on success
// or (None, "message") on failure — so scripts can branch on failures
// (Starlark has no exception handling).
//
// Register from an init() so all builtins exist before any script compiles:
// compiled programs resolve predeclared names at compile time and are cached.
func RegisterStringNormalizer(name string, fn func(string) (string, error)) {
	regMu.Lock()
	defer regMu.Unlock()
	registry[name] = sl.NewBuiltin(name, func(_ *sl.Thread, b *sl.Builtin, args sl.Tuple, kwargs []sl.Tuple) (sl.Value, error) {
		var s string
		if err := sl.UnpackPositionalArgs(b.Name(), args, kwargs, 1, &s); err != nil {
			return nil, err
		}
		v, err := fn(s)
		if err != nil {
			return sl.Tuple{sl.None, sl.String(err.Error())}, nil
		}
		return sl.Tuple{sl.String(v), sl.None}, nil
	})
}

// predeclared returns the globals injected into every script run.
func predeclared() sl.StringDict {
	regMu.RLock()
	defer regMu.RUnlock()
	d := make(sl.StringDict, len(registry))
	for k, v := range registry {
		d[k] = v
	}
	return d
}
