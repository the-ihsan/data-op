package services

import (
	"errors"
	"strings"
	"testing"
)

const lowerEmailScript = `
def sanitize(data):
    if "email" in data:
        data["email"] = data["email"].lower()
    return data
`

func TestRunSanitizeRewritesValues(t *testing.T) {
	out, err := RunSanitize(lowerEmailScript, map[string][]string{
		"email": {"Alice@Example.COM"},
		"name":  {"Alice"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := out["email"][0]; got != "alice@example.com" {
		t.Fatalf("expected lowercased email, got %q", got)
	}
	if got := out["name"][0]; got != "Alice" {
		t.Fatalf("untouched field changed: %q", got)
	}
}

func TestRunSanitizeMultiEntryList(t *testing.T) {
	script := `
def sanitize(data):
    data["tags"] = [t.replace(" ", "") for t in data["tags"]]
    return data
`
	out, err := RunSanitize(script, map[string][]string{"tags": {" a ", "b b"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out["tags"]) != 2 || out["tags"][0] != "a" || out["tags"][1] != "bb" {
		t.Fatalf("unexpected tags: %#v", out["tags"])
	}
}

func TestRunSanitizeRejectsWithMessage(t *testing.T) {
	script := `
def sanitize(data):
    return None, "email domain not allowed"
`
	_, err := RunSanitize(script, map[string][]string{"email": {"a@b.com"}})
	var ve ErrValidation
	if !errors.As(err, &ve) {
		t.Fatalf("expected ErrValidation, got %v", err)
	}
	if ve.Message != "email domain not allowed" {
		t.Fatalf("unexpected message: %q", ve.Message)
	}
}

func TestRunSanitizeDropsNoneFields(t *testing.T) {
	script := `
def sanitize(data):
    data["notes"] = None
    return data
`
	out, err := RunSanitize(script, map[string][]string{"notes": {"x"}, "name": {"y"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := out["notes"]; ok {
		t.Fatal("expected notes to be dropped")
	}
	if out["name"][0] != "y" {
		t.Fatal("expected name to survive")
	}
}

func TestRunSanitizeRuntimeErrorIsValidation(t *testing.T) {
	script := `
def sanitize(data):
    fail("boom")
`
	_, err := RunSanitize(script, map[string][]string{})
	var ve ErrValidation
	if !errors.As(err, &ve) {
		t.Fatalf("expected ErrValidation, got %v", err)
	}
	if !strings.Contains(ve.Message, "boom") {
		t.Fatalf("expected message to carry the script error, got %q", ve.Message)
	}
}

func TestRunSanitizeNonDictReturnRejected(t *testing.T) {
	script := `
def sanitize(data):
    return "nope"
`
	if _, err := RunSanitize(script, map[string][]string{}); err == nil {
		t.Fatal("expected error for non-dict return")
	}
}

func TestValidateSanitizeScript(t *testing.T) {
	if err := ValidateSanitizeScript(lowerEmailScript); err != nil {
		t.Fatalf("valid script rejected: %v", err)
	}
	if err := ValidateSanitizeScript(`def sanitize(`); err == nil {
		t.Fatal("expected compile error")
	}
	if err := ValidateSanitizeScript(`x = 42`); err == nil {
		t.Fatal("expected 'must define sanitize' error")
	}
	if err := ValidateSanitizeScript(`sanitize = 42`); err == nil {
		t.Fatal("expected 'must be a function' error")
	}
}

func TestSanitizeSandboxHasNoAmbientAccess(t *testing.T) {
	// Undefined names (os, open, ...) are compile-time resolver errors:
	// scripts can only see the Starlark universe plus registered builtins.
	for _, script := range []string{
		"def sanitize(data):\n    return os.environ\n",
		"def sanitize(data):\n    open(\"/etc/passwd\")\n    return data\n",
	} {
		if err := ValidateSanitizeScript(script); err == nil {
			t.Fatalf("expected sandbox compile error for script %q", script)
		}
	}
}

func TestRunSanitizeTimesOutOnInfiniteLoop(t *testing.T) {
	script := `
def sanitize(data):
    while True:
        pass
`
	if _, err := RunSanitize(script, map[string][]string{}); err == nil {
		t.Fatal("expected step/timeout error for infinite loop")
	}
}

func TestRunSanitizeFacebookBuiltins(t *testing.T) {
	script := `
def sanitize(data):
    v, err = fb_profile(data["profile"])
    if err != None:
        return None, "profile: " + err
    data["profile"] = v
    return data
`
	out, err := RunSanitize(script, map[string][]string{"profile": {"Zuck"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := out["profile"][0]; got != "https://facebook.com/zuck" {
		t.Fatalf("expected canonical profile url, got %q", got)
	}

	_, err = RunSanitize(script, map[string][]string{"profile": {"https://twitter.com/zuck"}})
	var ve ErrValidation
	if !errors.As(err, &ve) {
		t.Fatalf("expected ErrValidation for non-facebook url, got %v", err)
	}
	if !strings.HasPrefix(ve.Message, "profile: ") {
		t.Fatalf("expected script-provided message, got %q", ve.Message)
	}
}

func TestRunSanitizeReusesCachedProgram(t *testing.T) {
	// Same script twice: the second run hits the compiled-program cache and
	// must behave identically.
	for i := 0; i < 2; i++ {
		out, err := RunSanitize(lowerEmailScript, map[string][]string{"email": {"X@Y.Z"}})
		if err != nil {
			t.Fatalf("run %d: unexpected error: %v", i, err)
		}
		if out["email"][0] != "x@y.z" {
			t.Fatalf("run %d: unexpected output %#v", i, out)
		}
	}
}
