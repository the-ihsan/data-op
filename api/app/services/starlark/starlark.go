// Package starlark runs stage "sanitize entry" scripts in an embedded
// Starlark interpreter (go.starlark.net). A script must define a function:
//
//	def sanitize(data):
//	    # data: dict keyed by field key; single-entry fields are strings,
//	    # multi-entry fields are lists of strings.
//	    data["email"] = data.get("email", "").lower()
//	    return data                      # accept with sanitized values
//	    # return None, "bad email"       # or reject the entry with an error
//
// Scripts are hermetic by design (no imports, no IO); execution is bounded
// by a step budget and a wall-clock timeout. Compiled programs are cached
// in memory keyed by the script's hash, so only the first run of a given
// script pays the parse/compile cost.
package starlark

import (
	"crypto/sha256"
	"fmt"
	"strconv"
	"sync"
	"time"

	sl "go.starlark.net/starlark"
	"go.starlark.net/syntax"
)

// EntryFunc is the function name every sanitize script must define.
const EntryFunc = "sanitize"

const (
	runTimeout = time.Second
	maxSteps   = 5_000_000
	maxCached  = 256
)

var fileOpts = &syntax.FileOptions{
	Set:             true,
	While:           true,
	TopLevelControl: true,
	GlobalReassign:  true,
	Recursion:       true,
}

// RejectionError is returned by Run when the script rejects the entry
// (returns None, or a (None, "message") pair). Message is user-facing.
type RejectionError struct{ Message string }

func (e RejectionError) Error() string { return e.Message }

var (
	cacheMu sync.Mutex
	cache   = map[[sha256.Size]byte]*sl.Program{}
)

// compile returns the cached compiled program for a script, compiling and
// caching it on first sight.
func compile(script string) (*sl.Program, error) {
	key := sha256.Sum256([]byte(script))
	cacheMu.Lock()
	prog, hit := cache[key]
	cacheMu.Unlock()
	if hit {
		return prog, nil
	}

	_, prog, err := sl.SourceProgramOptions(fileOpts, "sanitize.star", script, predeclared().Has)
	if err != nil {
		return nil, fmt.Errorf("compile error: %v", err)
	}

	cacheMu.Lock()
	if len(cache) >= maxCached {
		cache = map[[sha256.Size]byte]*sl.Program{}
	}
	cache[key] = prog
	cacheMu.Unlock()
	return prog, nil
}

// newThread builds an execution-bounded thread; call the returned stop
// function once the thread is no longer used.
func newThread() (*sl.Thread, func()) {
	th := &sl.Thread{Name: EntryFunc}
	th.SetMaxExecutionSteps(maxSteps)
	timer := time.AfterFunc(runTimeout, func() { th.Cancel("execution timed out") })
	return th, func() { timer.Stop() }
}

// entryFunction executes the program's top level and returns the sanitize
// function it defines.
func entryFunction(th *sl.Thread, prog *sl.Program) (sl.Callable, error) {
	globals, err := prog.Init(th, predeclared())
	if err != nil {
		return nil, fmt.Errorf("script error: %v", err)
	}
	v, ok := globals[EntryFunc]
	if !ok {
		return nil, fmt.Errorf("script must define a function %q", EntryFunc)
	}
	fn, ok := v.(sl.Callable)
	if !ok {
		return nil, fmt.Errorf("%q must be a function, got %s", EntryFunc, v.Type())
	}
	return fn, nil
}

// Validate checks that a script compiles, runs at the top level, and defines
// the sanitize function. Used when a stage's script is created or updated;
// as a side effect the compiled program lands in the cache.
func Validate(script string) error {
	prog, err := compile(script)
	if err != nil {
		return err
	}
	th, stop := newThread()
	defer stop()
	_, err = entryFunction(th, prog)
	return err
}

// Run applies a sanitize script to the submitted values and returns the
// sanitized values grouped by field key. A script rejection surfaces as
// RejectionError; anything else is a script/conversion error.
func Run(script string, values map[string][]string) (map[string][]string, error) {
	prog, err := compile(script)
	if err != nil {
		return nil, err
	}
	th, stop := newThread()
	defer stop()
	fn, err := entryFunction(th, prog)
	if err != nil {
		return nil, err
	}
	ret, err := sl.Call(th, fn, sl.Tuple{valuesToDict(values)}, nil)
	if err != nil {
		return nil, fmt.Errorf("script error: %v", err)
	}
	return decodeResult(ret)
}

// valuesToDict converts submitted values into the dict handed to sanitize:
// single-entry fields become strings, multi-entry fields become lists.
func valuesToDict(values map[string][]string) *sl.Dict {
	d := sl.NewDict(len(values))
	for key, vals := range values {
		if len(vals) == 1 {
			_ = d.SetKey(sl.String(key), sl.String(vals[0]))
			continue
		}
		items := make([]sl.Value, len(vals))
		for i, v := range vals {
			items[i] = sl.String(v)
		}
		_ = d.SetKey(sl.String(key), sl.NewList(items))
	}
	return d
}

// decodeResult converts the script's return value back into values grouped
// by field key. Supported shapes: dict (accept), None (reject), or a
// (result, error) pair where a non-None error rejects with that message.
func decodeResult(v sl.Value) (map[string][]string, error) {
	if pair, ok := v.(sl.Tuple); ok && len(pair) == 2 {
		if pair[1] != sl.None {
			msg, _ := sl.AsString(pair[1])
			if msg == "" {
				msg = pair[1].String()
			}
			return nil, RejectionError{msg}
		}
		v = pair[0]
	}
	if v == sl.None {
		return nil, RejectionError{"entry rejected by sanitize script"}
	}
	mapping, ok := v.(sl.IterableMapping)
	if !ok {
		return nil, fmt.Errorf(`%s must return a dict, or None, "message" to reject (got %s)`, EntryFunc, v.Type())
	}

	out := map[string][]string{}
	for _, item := range mapping.Items() {
		key, ok := sl.AsString(item[0])
		if !ok {
			return nil, fmt.Errorf("returned dict has a non-string key (%s)", item[0].String())
		}
		entries, err := decodeEntries(item[1])
		if err != nil {
			return nil, fmt.Errorf("field %q: %v", key, err)
		}
		if len(entries) > 0 {
			out[key] = entries
		}
	}
	return out, nil
}

// decodeEntries flattens one returned field value (scalar or list) into
// strings. None drops the field.
func decodeEntries(v sl.Value) ([]string, error) {
	switch val := v.(type) {
	case sl.NoneType:
		return nil, nil
	case *sl.List:
		return decodeSequence(val.Len(), val.Index)
	case sl.Tuple:
		return decodeSequence(val.Len(), val.Index)
	default:
		s, err := decodeScalar(v)
		if err != nil {
			return nil, fmt.Errorf("values must be strings, numbers, booleans or lists (got %s)", v.Type())
		}
		return []string{s}, nil
	}
}

func decodeSequence(n int, index func(int) sl.Value) ([]string, error) {
	entries := make([]string, 0, n)
	for i := 0; i < n; i++ {
		s, err := decodeScalar(index(i))
		if err != nil {
			return nil, err
		}
		entries = append(entries, s)
	}
	return entries, nil
}

func decodeScalar(v sl.Value) (string, error) {
	switch val := v.(type) {
	case sl.String:
		return string(val), nil
	case sl.Bool:
		if bool(val) {
			return "true", nil
		}
		return "false", nil
	case sl.Int:
		return val.String(), nil
	case sl.Float:
		return strconv.FormatFloat(float64(val), 'g', -1, 64), nil
	default:
		return "", fmt.Errorf("list entries must be strings, numbers or booleans (got %s)", v.Type())
	}
}
