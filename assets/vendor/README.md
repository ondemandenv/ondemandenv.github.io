# Vendor Libraries

Self-hosted JavaScript libraries for reliable loading without CDN dependencies.

## Files

- **mermaid.min.js** (v10.6.1) - Mermaid diagram rendering library
- **svg-pan-zoom.min.js** (v3.6.2) - SVG pan and zoom functionality  
- **screenfull.js** (v6.0.2) - Cross-browser fullscreen API wrapper

## Why Self-Hosted?

- **Reliability**: No CDN outages or network issues
- **Performance**: Faster loading from same domain
- **Security**: No third-party dependencies in production
- **Offline**: Works without internet connection

## Update Process

To update libraries:

```bash
cd assets/vendor

# Update Mermaid
curl -o mermaid.min.js https://cdn.jsdelivr.net/npm/mermaid@X.X.X/dist/mermaid.min.js

# Update svg-pan-zoom  
curl -o svg-pan-zoom.min.js https://cdn.jsdelivr.net/npm/svg-pan-zoom@X.X.X/dist/svg-pan-zoom.min.js

# Update screenfull
curl -o screenfull.js https://cdn.jsdelivr.net/npm/screenfull@X.X.X/index.js
```

Note: screenfull doesn't provide a minified version, use index.js directly.