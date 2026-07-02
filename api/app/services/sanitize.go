package services

import (
	"errors"

	"goravel/app/services/starlark"
)

// Stages can carry an optional Starlark "sanitize entry" script
// (stages.sanitize_entry) that runs before an entry's values are validated
// and persisted. The script must define:
//
//	def sanitize(data):
//	    # data: dict keyed by field key; single-entry fields are strings,
//	    # multi-entry fields are lists of strings.
//	    data["email"] = data.get("email", "").lower()
//	    return data                      # accept with sanitized values
//	    # return None, "bad email"       # or reject the entry with an error
//
// Execution is sandboxed and bounded (see services/starlark). Compiled
// programs are cached by script hash, so a stage's script compiles once and
// subsequent saves/bulk-import lines reuse the compiled program. Scripts can
// call the builtins registered by services/starlark (fb_profile, fb_group,
// fb_page — see starlark/facebook.go).

// ValidateSanitizeScript checks that a sanitize script compiles, runs at the
// top level, and defines sanitize(data). Used when a stage's sanitize_entry
// is created or updated (and it warms the compiled-program cache).
func ValidateSanitizeScript(script string) error {
	return starlark.Validate(script)
}

// RunSanitize applies a stage's sanitize script to the submitted values and
// returns the sanitized values grouped by field key. Rejections and script
// failures surface as ErrValidation so callers respond with HTTP 400.
func RunSanitize(script string, values map[string][]string) (map[string][]string, error) {
	out, err := starlark.Run(script, values)
	if err != nil {
		var rej starlark.RejectionError
		if errors.As(err, &rej) {
			return nil, ErrValidation{rej.Message}
		}
		return nil, ErrValidation{"sanitize script: " + err.Error()}
	}
	return out, nil
}
