package services

import "testing"

func TestTargetHashOrderIndependentWithinField(t *testing.T) {
	target := uniqueTarget{ref: "field:tags", fieldKeys: []string{"tags"}}

	h1, ok1 := targetHash(target, map[string][]string{"tags": {"b", "a"}})
	h2, ok2 := targetHash(target, map[string][]string{"tags": {"a", "b"}})

	if !ok1 || !ok2 {
		t.Fatal("expected both hashes to be present")
	}
	if h1 != h2 {
		t.Fatalf("expected order-independent hash within a field, got %s vs %s", h1, h2)
	}
}

func TestTargetHashDistinctValues(t *testing.T) {
	target := uniqueTarget{ref: "field:email", fieldKeys: []string{"email"}}

	h1, _ := targetHash(target, map[string][]string{"email": {"a@x.com"}})
	h2, _ := targetHash(target, map[string][]string{"email": {"b@x.com"}})

	if h1 == h2 {
		t.Fatal("distinct values should produce distinct hashes")
	}
}

func TestTargetHashEmptySkipped(t *testing.T) {
	target := uniqueTarget{ref: "constraint:1", fieldKeys: []string{"a", "b"}}

	if _, ok := targetHash(target, map[string][]string{"a": {}, "b": {""}}); ok {
		t.Fatal("all-empty target should be skipped (ok=false)")
	}
}

func TestCompositeHashOrderSensitiveAcrossFields(t *testing.T) {
	target := uniqueTarget{ref: "constraint:1", fieldKeys: []string{"first", "last"}}

	h1, _ := targetHash(target, map[string][]string{"first": {"john"}, "last": {"doe"}})
	h2, _ := targetHash(target, map[string][]string{"first": {"doe"}, "last": {"john"}})

	if h1 == h2 {
		t.Fatal("composite hash should distinguish which field holds which value")
	}
}

func TestNormalizeBool(t *testing.T) {
	cases := map[string]string{"true": "true", "1": "true", "yes": "true", "on": "true", "false": "false", "0": "false", "": "false"}
	for in, want := range cases {
		if got := normalizeBool(in); got != want {
			t.Errorf("normalizeBool(%q) = %q, want %q", in, got, want)
		}
	}
}
