// Package ezghtunnel forwards @ezghcloud/rum's tunnel requests to obs-browser.
//
// tunnel.go — mux.Handle("/_ezgh", ezghtunnel.Handler("")), then init({ tunnel: "/_ezgh" }).
// Behind a load balancer, put the browser's address in r.RemoteAddr first (for example with a
// trusted-proxy middleware). It never forwards Cookie or Authorization (sendBeacon carries the
// site's cookies).
package ezghtunnel

import (
	"bytes"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
)

// DefaultUpstream is the browser ingest host.
const DefaultUpstream = "https://obs-browser.ezghcloud.com"

var paths = map[string]bool{"/v1/traces": true, "/v1/logs": true}

// Handler forwards POST <mount>?path=/v1/{traces,logs}&… to upstream (DefaultUpstream when
// empty), with the whole query and the body unchanged.
func Handler(upstream string) http.Handler {
	if upstream == "" {
		upstream = DefaultUpstream
	}
	client := &http.Client{}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if r.Method != http.MethodPost || !paths[path] {
			http.NotFound(w, r)
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
			} else {
				http.Error(w, "bad request", http.StatusBadRequest)
			}
			return
		}
		req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, upstream+path+"?"+r.URL.RawQuery, bytes.NewReader(body))
		if err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		ct := r.Header.Get("Content-Type")
		if ct == "" {
			ct = "text/plain;charset=UTF-8"
		}
		req.Header.Set("Content-Type", ct)
		if o := r.Header.Get("Origin"); o != "" {
			req.Header.Set("Origin", o)
		}
		// The client's chain (every X-Forwarded-For line), then the browser's address. A trusted-proxy
		// middleware may leave RemoteAddr as a bare IP, without a port.
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		chain := r.Header.Values("X-Forwarded-For")
		if net.ParseIP(host) != nil {
			chain = append(chain, host)
		}
		if len(chain) > 0 {
			req.Header.Set("X-Forwarded-For", strings.Join(chain, ", "))
		}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, "upstream unavailable", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		for _, h := range []string{"Content-Type", "Retry-After"} {
			if v := resp.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	})
}
