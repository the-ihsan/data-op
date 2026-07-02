package starlark

import (
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"
)

// The Facebook normalizers are exposed to sanitize scripts as the builtins
// fb_profile / fb_group / fb_page. Each takes a raw string and returns a
// (canonical_url, None) pair, or (None, "error message") on invalid input,
// so equivalent URL variants dedupe to the same stored value.
func init() {
	RegisterStringNormalizer("fb_profile", normalizeFacebookProfile)
	RegisterStringNormalizer("fb_group", normalizeFacebookGroup)
	RegisterStringNormalizer("fb_page", normalizeFacebookPage)
}

var facebookSlugRe = regexp.MustCompile(`^[a-zA-Z0-9.\-_]{1,100}$`)

var facebookReservedSegments = map[string]bool{
	"pages": true, "groups": true, "events": true, "watch": true,
	"marketplace": true, "gaming": true, "stories": true, "reels": true,
	"login": true, "help": true, "business": true, "ads": true,
	"share": true, "sharer.php": true, "photo.php": true, "video.php": true,
	"hashtag": true, "notifications": true, "settings": true,
}

// normalizeFacebookProfile validates a Facebook profile reference and returns a
// canonical URL so equivalent links dedupe to the same stored value.
func normalizeFacebookProfile(raw string) (string, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return "", fmt.Errorf("empty")
	}

	if !strings.ContainsAny(v, ":/") {
		if !facebookSlugRe.MatchString(v) {
			return "", fmt.Errorf("invalid username")
		}
		return "https://facebook.com/" + strings.ToLower(v), nil
	}

	path, query, err := parseFacebookURL(v)
	if err != nil {
		return "", err
	}

	if strings.EqualFold(path, "profile.php") {
		id := strings.TrimSpace(query.Get("id"))
		if !isNumericID(id) {
			return "", fmt.Errorf("missing profile id")
		}
		return "https://facebook.com/profile.php?id=" + id, nil
	}

	if strings.HasPrefix(strings.ToLower(path), "people/") {
		parts := strings.Split(path, "/")
		if len(parts) < 3 {
			return "", fmt.Errorf("invalid people url")
		}
		id := strings.TrimSpace(parts[len(parts)-1])
		if !isNumericID(id) {
			return "", fmt.Errorf("invalid people url")
		}
		return "https://facebook.com/profile.php?id=" + id, nil
	}

	if strings.HasPrefix(strings.ToLower(path), "groups/") {
		return "", fmt.Errorf("not a profile url")
	}

	if path != "" && !strings.Contains(path, "/") {
		seg := strings.ToLower(path)
		if facebookReservedSegments[seg] {
			return "", fmt.Errorf("reserved path")
		}
		if !facebookSlugRe.MatchString(seg) {
			return "", fmt.Errorf("invalid username")
		}
		return "https://facebook.com/" + seg, nil
	}

	return "", fmt.Errorf("unrecognized format")
}

// normalizeFacebookGroup validates a Facebook group reference and returns a
// canonical URL (https://facebook.com/groups/{id-or-slug}).
func normalizeFacebookGroup(raw string) (string, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return "", fmt.Errorf("empty")
	}

	if !strings.ContainsAny(v, ":/") {
		if !facebookSlugRe.MatchString(v) {
			return "", fmt.Errorf("invalid group slug")
		}
		return "https://facebook.com/groups/" + strings.ToLower(v), nil
	}

	path, query, err := parseFacebookURL(v)
	if err != nil {
		return "", err
	}

	if strings.EqualFold(path, "group.php") {
		gid := strings.TrimSpace(query.Get("gid"))
		if !isNumericID(gid) {
			return "", fmt.Errorf("missing group id")
		}
		return "https://facebook.com/groups/" + gid, nil
	}

	if !strings.HasPrefix(strings.ToLower(path), "groups/") {
		return "", fmt.Errorf("not a group url")
	}

	parts := strings.Split(path, "/")
	if len(parts) < 2 || parts[1] == "" {
		return "", fmt.Errorf("invalid group url")
	}
	slug := parts[1]
	if isNumericID(slug) {
		return "https://facebook.com/groups/" + slug, nil
	}
	slug = strings.ToLower(slug)
	if !facebookSlugRe.MatchString(slug) {
		return "", fmt.Errorf("invalid group slug")
	}
	return "https://facebook.com/groups/" + slug, nil
}

// normalizeFacebookPage validates a Facebook page reference and returns a
// canonical URL so vanity and /pages/…/id links dedupe by numeric id when possible.
func normalizeFacebookPage(raw string) (string, error) {
	v := strings.TrimSpace(raw)
	if v == "" {
		return "", fmt.Errorf("empty")
	}

	if !strings.ContainsAny(v, ":/") {
		if !facebookSlugRe.MatchString(v) {
			return "", fmt.Errorf("invalid page slug")
		}
		seg := strings.ToLower(v)
		if facebookReservedSegments[seg] {
			return "", fmt.Errorf("reserved path")
		}
		return "https://facebook.com/" + seg, nil
	}

	path, query, err := parseFacebookURL(v)
	if err != nil {
		return "", err
	}

	lowerPath := strings.ToLower(path)
	if strings.HasPrefix(lowerPath, "groups/") || strings.HasPrefix(lowerPath, "people/") {
		return "", fmt.Errorf("not a page url")
	}

	if strings.EqualFold(path, "profile.php") {
		id := strings.TrimSpace(query.Get("id"))
		if !isNumericID(id) {
			return "", fmt.Errorf("missing page id")
		}
		return "https://facebook.com/profile.php?id=" + id, nil
	}

	if strings.HasPrefix(lowerPath, "pages/") {
		parts := strings.Split(path, "/")
		if len(parts) < 3 {
			return "", fmt.Errorf("invalid page url")
		}
		id := strings.TrimSpace(parts[len(parts)-1])
		if !isNumericID(id) {
			return "", fmt.Errorf("invalid page url")
		}
		return "https://facebook.com/profile.php?id=" + id, nil
	}

	if path != "" && !strings.Contains(path, "/") {
		seg := strings.ToLower(path)
		if facebookReservedSegments[seg] {
			return "", fmt.Errorf("reserved path")
		}
		if !facebookSlugRe.MatchString(seg) {
			return "", fmt.Errorf("invalid page slug")
		}
		return "https://facebook.com/" + seg, nil
	}

	return "", fmt.Errorf("unrecognized format")
}

func parseFacebookURL(raw string) (path string, query url.Values, err error) {
	v := strings.TrimSpace(raw)
	lower := strings.ToLower(v)
	if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
		v = "https://" + strings.TrimPrefix(strings.TrimPrefix(v, "//"), "/")
	}

	u, parseErr := url.Parse(v)
	if parseErr != nil || u.Host == "" {
		return "", nil, fmt.Errorf("invalid url")
	}
	if facebookCanonicalHost(u.Host) == "" {
		return "", nil, fmt.Errorf("not facebook")
	}
	return strings.Trim(u.Path, "/"), u.Query(), nil
}

func facebookCanonicalHost(host string) string {
	host = strings.ToLower(host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	for {
		changed := false
		for _, prefix := range []string{"www.", "m.", "mobile.", "web.", "l."} {
			if strings.HasPrefix(host, prefix) {
				host = strings.TrimPrefix(host, prefix)
				changed = true
				break
			}
		}
		if !changed {
			break
		}
	}
	if host == "fb.com" {
		host = "facebook.com"
	}
	if host != "facebook.com" {
		return ""
	}
	return host
}

func isNumericID(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
