package starlark

import "testing"

func TestNormalizeFacebookProfile(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"johndoe", "https://facebook.com/johndoe", false},
		{"John.Doe", "https://facebook.com/john.doe", false},
		{"https://www.facebook.com/johndoe", "https://facebook.com/johndoe", false},
		{"http://facebook.com/johndoe/", "https://facebook.com/johndoe", false},
		{"https://m.facebook.com/johndoe", "https://facebook.com/johndoe", false},
		{"facebook.com/johndoe", "https://facebook.com/johndoe", false},
		{"https://fb.com/johndoe", "https://facebook.com/johndoe", false},
		{
			"https://www.facebook.com/profile.php?id=100012345678901&ref=bookmarks",
			"https://facebook.com/profile.php?id=100012345678901",
			false,
		},
		{
			"https://facebook.com/people/John-Doe/100012345678901/",
			"https://facebook.com/profile.php?id=100012345678901",
			false,
		},
		{"https://facebook.com/groups/mygroup", "", true},
		{"https://twitter.com/johndoe", "", true},
		{"", "", true},
	}

	for _, tc := range cases {
		got, err := normalizeFacebookProfile(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("normalizeFacebookProfile(%q) expected error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Errorf("normalizeFacebookProfile(%q) unexpected error: %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("normalizeFacebookProfile(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeFacebookGroup(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"mygroup", "https://facebook.com/groups/mygroup", false},
		{"My-Group", "https://facebook.com/groups/my-group", false},
		{"https://www.facebook.com/groups/mygroup/", "https://facebook.com/groups/mygroup", false},
		{"https://m.facebook.com/groups/123456789", "https://facebook.com/groups/123456789", false},
		{"facebook.com/groups/mygroup/about", "https://facebook.com/groups/mygroup", false},
		{"https://facebook.com/group.php?gid=987654321", "https://facebook.com/groups/987654321", false},
		{"https://facebook.com/johndoe", "", true},
		{"https://facebook.com/pages/foo/123", "", true},
	}

	for _, tc := range cases {
		got, err := normalizeFacebookGroup(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("normalizeFacebookGroup(%q) expected error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Errorf("normalizeFacebookGroup(%q) unexpected error: %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("normalizeFacebookGroup(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeFacebookPage(t *testing.T) {
	cases := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"mypage", "https://facebook.com/mypage", false},
		{"https://www.facebook.com/MyPage/", "https://facebook.com/mypage", false},
		{
			"https://facebook.com/pages/My-Page/123456789012345",
			"https://facebook.com/profile.php?id=123456789012345",
			false,
		},
		{
			"https://www.facebook.com/profile.php?id=123456789012345",
			"https://facebook.com/profile.php?id=123456789012345",
			false,
		},
		{"https://facebook.com/groups/foo", "", true},
		{"https://facebook.com/people/John/123", "", true},
	}

	for _, tc := range cases {
		got, err := normalizeFacebookPage(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("normalizeFacebookPage(%q) expected error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Errorf("normalizeFacebookPage(%q) unexpected error: %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("normalizeFacebookPage(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeFacebookProfileEquivalentVariants(t *testing.T) {
	variants := []string{
		"https://www.facebook.com/johndoe",
		"http://facebook.com/johndoe/",
		"https://m.facebook.com/johndoe",
		"johndoe",
	}
	var canonical []string
	for _, v := range variants {
		normalized, err := normalizeFacebookProfile(v)
		if err != nil {
			t.Fatalf("normalize %q: %v", v, err)
		}
		canonical = append(canonical, normalized)
	}
	for i := 1; i < len(canonical); i++ {
		if canonical[i] != canonical[0] {
			t.Fatalf("variants normalize differently: %s vs %s", canonical[0], canonical[i])
		}
	}
}

func TestNormalizeFacebookGroupEquivalentVariants(t *testing.T) {
	variants := []string{
		"mygroup",
		"https://www.facebook.com/groups/mygroup/",
		"https://m.facebook.com/groups/mygroup/about",
	}
	var canonical []string
	for _, v := range variants {
		normalized, err := normalizeFacebookGroup(v)
		if err != nil {
			t.Fatalf("normalize %q: %v", v, err)
		}
		canonical = append(canonical, normalized)
	}
	for i := 1; i < len(canonical); i++ {
		if canonical[i] != canonical[0] {
			t.Fatalf("variants normalize differently: %s vs %s", canonical[0], canonical[i])
		}
	}
}
