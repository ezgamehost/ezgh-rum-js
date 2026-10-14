package ezghtunnel

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

type seen struct {
	url    string
	header http.Header
	body   []byte
}

type fakeUpstream struct {
	mu         sync.Mutex
	seen       []seen
	status     int
	retryAfter string
}

func (f *fakeUpstream) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	b, _ := io.ReadAll(r.Body)
	f.mu.Lock()
	f.seen = append(f.seen, seen{r.URL.RequestURI(), r.Header.Clone(), b})
	status, ra := f.status, f.retryAfter
	f.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	if ra != "" {
		w.Header().Set("Retry-After", ra)
	}
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"partialSuccess":{}}`))
}

const query = "?path=/v1/logs&ct=ezgh_ct_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&enc=gzip&sv=1"

func gz(t *testing.T) []byte {
	t.Helper()
	var b bytes.Buffer
	z := gzip.NewWriter(&b)
	_, _ = z.Write([]byte(`{"resourceLogs":[]}`))
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func setup(t *testing.T) (*fakeUpstream, http.Handler) {
	t.Helper()
	f := &fakeUpstream{}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	return f, Handler(srv.URL)
}

func TestForwardsQueryBodyOriginAndXFFButNoCredentials(t *testing.T) {
	f, h := setup(t)
	body := gz(t)
	r := httptest.NewRequest(http.MethodPost, "/_ezgh"+query, bytes.NewReader(body))
	r.RemoteAddr = "198.51.100.7:51234"
	r.Header.Set("Content-Type", "text/plain;charset=UTF-8")
	r.Header.Set("Origin", "https://shop.example")
	r.Header.Set("Cookie", "session=s3cret")
	r.Header.Set("Authorization", "Bearer nope")
	r.Header.Set("X-Forwarded-For", "203.0.113.9")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("status %d, content type %q", w.Code, w.Header().Get("Content-Type"))
	}
	if len(f.seen) != 1 {
		t.Fatalf("upstream saw %d requests", len(f.seen))
	}
	s := f.seen[0]
	if s.url != "/v1/logs"+query {
		t.Errorf("url %q", s.url)
	}
	if !bytes.Equal(s.body, body) {
		t.Error("body changed")
	}
	if s.header.Get("Origin") != "https://shop.example" || s.header.Get("Content-Type") != "text/plain;charset=UTF-8" {
		t.Errorf("headers %v", s.header)
	}
	if s.header.Get("Cookie") != "" || s.header.Get("Authorization") != "" {
		t.Errorf("credentials forwarded: %v", s.header)
	}
	if got := s.header.Get("X-Forwarded-For"); got != "203.0.113.9, 198.51.100.7" {
		t.Errorf("X-Forwarded-For %q", got)
	}
}

func TestOnlyTracesAndLogs(t *testing.T) {
	f, h := setup(t)
	for _, target := range []string{"/_ezgh?path=/v1/metrics&ct=x", "/_ezgh?path=/v1/other&ct=x", "/_ezgh?ct=x", "/_ezgh"} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, target, strings.NewReader("{}")))
		if w.Code != http.StatusNotFound {
			t.Errorf("%s: %d", target, w.Code)
		}
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/_ezgh"+query, nil))
	if w.Code != http.StatusNotFound {
		t.Errorf("GET: %d", w.Code)
	}
	if len(f.seen) != 0 {
		t.Errorf("upstream saw %d requests", len(f.seen))
	}
}

func TestBodyOver1MiBIs413(t *testing.T) {
	f, h := setup(t)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/_ezgh"+query, bytes.NewReader(make([]byte, 2<<20))))
	if w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status %d", w.Code)
	}
	if len(f.seen) != 0 {
		t.Errorf("upstream saw %d requests", len(f.seen))
	}
}

func TestUpstream429KeepsRetryAfter(t *testing.T) {
	f, h := setup(t)
	f.status, f.retryAfter = http.StatusTooManyRequests, "7"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/_ezgh"+strings.Replace(query, "/v1/logs", "/v1/traces", 1), bytes.NewReader(gz(t))))
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") != "7" {
		t.Errorf("status %d, Retry-After %q", w.Code, w.Header().Get("Retry-After"))
	}
}
