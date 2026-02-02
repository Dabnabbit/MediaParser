# Phase 3: Web UI - Upload + Status - Research

**Researched:** 2026-02-02
**Domain:** Flask web application with file uploads, real-time progress tracking, and thumbnail display
**Confidence:** HIGH

## Summary

This phase requires implementing a Flask-based web UI for file uploads (including folder uploads via webkitdirectory), real-time progress tracking of background Huey jobs, and thumbnail-based results display. The research identified the standard Flask stack for this use case and critical patterns for handling large file uploads safely.

The standard approach uses Flask's native file upload handling with `request.files.getlist()` for multiple files, Pillow for thumbnail generation with EXIF orientation handling, and Server-Sent Events (SSE) for real-time progress updates. SSE is preferred over polling for this architecture because it reduces server load, eliminates polling overhead, and works naturally with Flask's generator pattern.

Key security concerns include filename sanitization with `secure_filename()`, file extension validation, MIME type checking, and strict file size limits. Large file uploads require special handling to avoid blocking the Flask application and memory exhaustion. Thumbnail generation must account for EXIF orientation metadata to prevent rotated images.

**Primary recommendation:** Use Flask's native file upload with SSE for progress tracking, Pillow with `exif_transpose()` for thumbnails, and vanilla JavaScript (no framework) for a lightweight, maintainable frontend.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Flask | 3.1.x | Web framework (already in use) | Lightweight, established project choice |
| Pillow | 12.1.0+ | Image thumbnail generation | De facto standard Python image library, built-in thumbnail support |
| python-magic | Latest | MIME type validation | Reads file magic bytes, more reliable than extension checking |
| Werkzeug | 3.x (via Flask) | File upload utilities (`secure_filename()`) | Flask's underlying WSGI library, trusted security functions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ImageOps.exif_transpose() | Built into Pillow | Fix EXIF orientation | Essential for all thumbnail generation to prevent rotated images |
| flask.Response(stream()) | Built into Flask | Server-Sent Events streaming | Real-time progress updates with generator pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SSE for progress | Polling every 1-2 seconds | Polling increases server load, header overhead (15KB per request), and maximal latency over 3 network transits. SSE reduces latency and server load. |
| SSE for progress | Flask-SocketIO (WebSocket) | WebSocket is bidirectional (overkill for server→client updates), requires additional library, more complex deployment (needs async workers). SSE works with standard Flask threading. |
| Vanilla JavaScript | React/Vue frontend | Adds build toolchain, framework lock-in, complexity. Phase 3 doesn't need component state management or reactive updates. Vanilla JS + Web Components is gaining traction in 2026. |
| Pillow thumbnails | preview-generator library | preview-generator supports 450+ file types (overkill for v1 photo focus). Pillow sufficient for images, lighter dependency. |

**Installation:**
```bash
# Already installed from Phase 1-2: Flask, python-magic
pip install Pillow==12.1.0
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── routes/
│   ├── __init__.py
│   ├── upload.py          # File upload endpoints
│   ├── jobs.py            # Job status/control endpoints
│   └── sse.py             # Server-Sent Events progress stream
├── static/
│   ├── css/
│   │   └── main.css       # Single-pane layout, grid, accordions
│   ├── js/
│   │   ├── upload.js      # File upload handling
│   │   ├── progress.js    # SSE connection and progress display
│   │   └── results.js     # Thumbnail grid, multi-select, accordion
│   └── thumbnails/        # Generated thumbnails (auto-created)
├── templates/
│   ├── base.html          # Base template with layout
│   └── index.html         # Single-pane upload/progress/results
├── lib/
│   └── thumbnail.py       # Thumbnail generation utility
└── models.py              # (Existing) Job, File models
```

### Pattern 1: Flask File Upload with Multiple Files
**What:** Handle multiple file uploads including folder uploads using `request.files.getlist()`
**When to use:** All file upload endpoints in Phase 3
**Example:**
```python
# Source: https://flask.palletsprojects.com/en/stable/patterns/fileuploads/
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
import os

@app.route('/api/upload', methods=['POST'])
def upload_files():
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    files = request.files.getlist('files')
    uploaded = []

    for file in files:
        if file.filename == '':
            continue  # Skip empty file selections

        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            uploaded.append(filename)

    return jsonify({'uploaded': uploaded, 'count': len(uploaded)})

def allowed_file(filename):
    ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'heic', 'mp4', 'mov'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
```

### Pattern 2: Server-Sent Events for Progress Tracking
**What:** Stream job progress updates using Flask generators and SSE protocol
**When to use:** Real-time progress updates for background Huey jobs
**Example:**
```python
# Source: https://maxhalford.github.io/blog/flask-sse-no-deps/
from flask import Response
from queue import Queue
import time

# MessageAnnouncer pattern for pubsub without Redis
class MessageAnnouncer:
    def __init__(self):
        self.listeners = []

    def listen(self):
        q = Queue(maxsize=5)
        self.listeners.append(q)
        return q

    def announce(self, msg):
        for i in reversed(range(len(self.listeners))):
            try:
                self.listeners[i].put_nowait(msg)
            except:
                del self.listeners[i]  # Remove disconnected clients

announcer = MessageAnnouncer()

def format_sse(data: str, event=None) -> str:
    msg = f'data: {data}\n\n'
    if event is not None:
        msg = f'event: {event}\n{msg}'
    return msg

@app.route('/api/progress/<int:job_id>')
def stream_progress(job_id):
    def stream():
        messages = announcer.listen()
        while True:
            msg = messages.get()  # Blocks until message arrives
            if msg.get('job_id') == job_id:
                yield format_sse(json.dumps(msg))

    return Response(stream(), mimetype='text/event-stream')

# In worker task, announce progress:
# announcer.announce({'job_id': job_id, 'progress': 50, 'current_file': 'photo.jpg'})
```

### Pattern 3: Thumbnail Generation with EXIF Orientation
**What:** Generate thumbnails while preserving proper image orientation using `exif_transpose()`
**When to use:** All thumbnail generation to prevent rotated images
**Example:**
```python
# Source: https://pillow.readthedocs.io/en/stable/reference/Image.html
# Source: https://alexwlchan.net/til/2024/photos-can-have-orientation-in-exif/
from PIL import Image, ImageOps
from pathlib import Path

def generate_thumbnail(source_path: Path, thumb_path: Path, size: tuple[int, int] = (200, 200)):
    """Generate thumbnail with EXIF orientation correction.

    Args:
        source_path: Path to source image
        thumb_path: Path to save thumbnail
        size: Maximum dimensions (width, height)
    """
    try:
        with Image.open(source_path) as img:
            # CRITICAL: Apply EXIF orientation before thumbnail
            img = ImageOps.exif_transpose(img)

            # Create thumbnail (modifies in-place, use copy() if needed)
            img.thumbnail(size, Image.Resampling.LANCZOS)

            # Save with reasonable JPEG quality
            img.save(thumb_path, 'JPEG', quality=85, optimize=True)

        return True
    except Exception as e:
        # Log error, return False
        return False
```

### Pattern 4: Vanilla JavaScript SSE Client
**What:** Connect to SSE endpoint and update UI in real-time without frameworks
**When to use:** Progress display, status updates
**Example:**
```javascript
// Source: MDN Web Docs EventSource API
class ProgressMonitor {
    constructor(jobId) {
        this.jobId = jobId;
        this.eventSource = null;
    }

    start() {
        this.eventSource = new EventSource(`/api/progress/${this.jobId}`);

        this.eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.updateProgress(data);
        };

        this.eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            this.eventSource.close();
        };
    }

    updateProgress(data) {
        document.getElementById('progress-bar').style.width = `${data.progress}%`;
        document.getElementById('current-file').textContent = data.current_file;
        document.getElementById('file-count').textContent = `${data.progress_current}/${data.progress_total}`;

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            this.eventSource.close();
            this.showResults();
        }
    }

    stop() {
        if (this.eventSource) {
            this.eventSource.close();
        }
    }
}
```

### Pattern 5: Multi-Select with Shift-Click
**What:** Standard checkbox multi-select pattern with shift-key range selection
**When to use:** Thumbnail grid selection for Phase 4+ batch operations
**Example:**
```javascript
// Source: Community pattern (jQuery Script, GitHub Gists)
class MultiSelectGrid {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.lastChecked = null;
        this.setupListeners();
    }

    setupListeners() {
        this.container.addEventListener('click', (e) => {
            const checkbox = e.target.closest('input[type="checkbox"]');
            if (!checkbox) return;

            if (e.shiftKey && this.lastChecked) {
                this.selectRange(this.lastChecked, checkbox);
            }

            this.lastChecked = checkbox;
        });
    }

    selectRange(start, end) {
        const checkboxes = Array.from(this.container.querySelectorAll('input[type="checkbox"]'));
        const startIdx = checkboxes.indexOf(start);
        const endIdx = checkboxes.indexOf(end);

        const [low, high] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

        for (let i = low; i <= high; i++) {
            checkboxes[i].checked = start.checked;
        }
    }
}
```

### Pattern 6: Folder Upload with webkitdirectory
**What:** HTML5 folder picker for directory uploads
**When to use:** Local folder import option
**Example:**
```html
<!-- Source: https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory -->
<input type="file" id="folder-picker" webkitdirectory multiple />

<script>
document.getElementById('folder-picker').addEventListener('change', (event) => {
    const files = Array.from(event.target.files);

    // Files include webkitRelativePath property
    files.forEach(file => {
        console.log(file.webkitRelativePath);  // e.g., "Photos/2024/IMG_1234.jpg"
    });

    // Upload with FormData
    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });

    fetch('/api/upload', {
        method: 'POST',
        body: formData
    });
});
</script>
```

### Anti-Patterns to Avoid
- **Blocking file uploads in Flask main thread:** Large file uploads block all requests. Use background tasks via Huey, not synchronous upload processing.
- **Loading entire file into memory:** Use chunked reading and streaming for large files. Flask saves files >500KB to disk automatically.
- **Polling every second:** Creates header overhead (15KB per poll) and server load. Use SSE instead.
- **Generating thumbnails synchronously during upload:** Thumbnails should generate during background processing (Huey task), not during upload endpoint.
- **Ignoring EXIF orientation:** Thumbnails without `exif_transpose()` appear rotated for portrait photos with landscape dimensions.
- **Not using `secure_filename()`:** Path traversal vulnerability (e.g., `../../../../etc/passwd`).
- **No file extension validation:** Allows HTML uploads causing XSS, or executable uploads.
- **No MAX_CONTENT_LENGTH:** Server accepts unlimited uploads, enabling DoS attacks.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filename sanitization | Custom regex to remove `../` | `werkzeug.utils.secure_filename()` | Handles Unicode, strips path separators, prevents traversal. Tested against thousands of edge cases. |
| MIME type detection | Check file extension | `python-magic` (already in use) | Reads file magic bytes. Prevents `.jpg.exe` or HTML masquerading as images. |
| Image orientation | Manual EXIF parsing and rotation | `ImageOps.exif_transpose()` | Handles all 8 EXIF orientation values, applies proper transformation. Orientation is deceptively complex (portrait photos can have landscape dimensions). |
| SSE message formatting | Manual `data: {}\n\n` strings | `format_sse()` helper function | SSE protocol requires exact format: `data: ...\n\n` with optional `event:` line. Easy to get wrong. |
| Thumbnail aspect ratio | Manual crop/resize math | `Image.thumbnail()` method | Maintains aspect ratio automatically, uses optimized resampling filters. |
| Multi-select shift-click | Array iteration logic | Established pattern (see Pattern 5) | Index-based range selection is error-prone. Community pattern handles edge cases. |

**Key insight:** File upload security is a well-explored attack surface. Use battle-tested libraries (`secure_filename`, `python-magic`, Pillow) instead of custom validation. Every custom file handling function is a potential vulnerability.

## Common Pitfalls

### Pitfall 1: EXIF Orientation Ignored (Images Appear Rotated)
**What goes wrong:** Thumbnails display rotated 90° even though original images display correctly in photo viewers. Portrait photos show as landscape.
**Why it happens:** Image data is stored in one orientation (e.g., 4032x3024 landscape), but EXIF metadata instructs viewers to rotate it (to portrait 3024x4032). Pillow reads raw pixels without applying EXIF orientation by default. When saving thumbnails, the EXIF instruction is lost but pixels remain in original orientation.
**How to avoid:** ALWAYS call `ImageOps.exif_transpose(img)` immediately after `Image.open()` before any processing. This "bakes in" the rotation by transforming actual pixel data.
**Warning signs:** Users report "thumbnails are sideways" or "portrait photos show as landscape." Dimension checks show width > height for portrait photos.

### Pitfall 2: Flask Blocks During Large File Uploads
**What goes wrong:** When user uploads large files (>100MB), the entire Flask application becomes unresponsive. Other users cannot access the site during upload.
**Why it happens:** Flask's single-threaded development server blocks on file uploads. Even with threading, large uploads hold connections. File upload processing (hashing, metadata extraction) in the request handler blocks the response.
**How to avoid:** (1) Run Flask in threaded mode (default in recent versions). (2) Upload endpoint should ONLY save files to upload directory and create Job, then return immediately. (3) Enqueue background Huey task for processing. (4) For production, use async WSGI server (Gunicorn with async workers) or configure reverse proxy timeouts.
**Warning signs:** Application "hangs" during uploads. Other users get timeout errors. File upload endpoint takes >30 seconds to respond.

### Pitfall 3: File Upload Without MAX_CONTENT_LENGTH (DoS Vulnerability)
**What goes wrong:** Attacker uploads multi-gigabyte files, exhausting server disk space or memory. Legitimate users cannot upload files. Server crashes or becomes unusable.
**Why it happens:** Flask accepts unlimited file sizes by default. No validation on content length.
**How to avoid:** Set `app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024` (16MB or appropriate limit). Flask automatically returns `413 Request Entity Too Large` for oversized uploads. Choose limit based on expected media files (16MB for photos, higher for videos).
**Warning signs:** Disk space fills rapidly. Memory exhaustion errors. Upload endpoint never returns.

### Pitfall 4: Missing `secure_filename()` (Path Traversal Vulnerability)
**What goes wrong:** Attacker uploads file named `../../../../etc/passwd` or `../../../app/config.py`. File is written to sensitive system location instead of upload directory. Attacker gains unauthorized file access or overwrites critical files.
**Why it happens:** Trusting user-supplied filenames. Direct use of `file.filename` in `os.path.join()` or `Path()` allows directory traversal.
**How to avoid:** ALWAYS call `filename = secure_filename(file.filename)` before saving. This strips path separators and normalizes Unicode. Example: `secure_filename('../../../../home/.bashrc')` returns `'home_.bashrc'`.
**Warning signs:** Files appear in unexpected directories. Security scanner flags path traversal vulnerability. Files with `../` in names.

### Pitfall 5: SSE Connection Limits (Browser Constraint)
**What goes wrong:** User opens multiple browser tabs/windows. SSE connections stop working after 6 tabs. Progress updates freeze.
**Why it happens:** Browsers limit 6 concurrent HTTP/1.1 connections per domain. Each SSE connection holds a connection open. Opening 7+ tabs exhausts connection pool.
**How to avoid:** (1) Use HTTP/2 which removes connection limits (most browsers support). (2) Implement connection sharing: use BroadcastChannel API to share one SSE connection across tabs. (3) Document limitation: "Progress tracking works best in one browser tab." (4) Fall back to polling if SSE connection fails.
**Warning signs:** Progress stops updating after opening multiple tabs. Browser developer console shows "connection refused" or pending requests.

### Pitfall 6: Empty Filename Check Missing
**What goes wrong:** Application crashes with `FileNotFoundError` or saves files with empty names. Upload form submission without file selection causes error.
**Why it happens:** When user submits form without selecting a file, `file.filename` is an empty string. Attempting to save causes OS error.
**How to avoid:** Check `if file.filename == '': continue` before processing each file. Flask documentation explicitly warns about this.
**Warning signs:** 500 errors on form submit without file selection. Empty filenames in upload directory. OS errors in logs.

### Pitfall 7: Session-Based Progress Fails with SSE
**What goes wrong:** SSE endpoint cannot read session data set in upload endpoint. Progress always shows 0%. Job status updates missing.
**Why it happens:** Flask sessions use signed cookies. SSE connection doesn't send cookies with some CORS configurations or proxies. Different session cookie on SSE vs upload endpoints.
**How to avoid:** Pass job_id in URL path (`/api/progress/{job_id}`), not in session. Query database for job status using job_id. Avoid session storage for job state.
**Warning signs:** SSE connects but shows no data. Job status accessible in upload endpoint but not SSE endpoint. CORS errors in browser console.

## Code Examples

Verified patterns from official sources:

### Complete File Upload Route with Security
```python
# Source: https://flask.palletsprojects.com/en/stable/patterns/fileuploads/
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from pathlib import Path
import magic

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB
app.config['UPLOAD_FOLDER'] = 'storage/uploads'

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'heic', 'mp4', 'mov'}
ALLOWED_MIMETYPES = {
    'image/jpeg', 'image/png', 'image/gif', 'image/heic',
    'video/mp4', 'video/quicktime'
}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_mimetype(filepath):
    mime = magic.Magic(mime=True)
    detected = mime.from_file(str(filepath))
    return detected in ALLOWED_MIMETYPES

@app.route('/api/upload', methods=['POST'])
def upload_files():
    # Check if files present
    if 'files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    files = request.files.getlist('files')
    uploaded = []
    errors = []

    for file in files:
        # Skip empty selections
        if file.filename == '':
            continue

        # Validate extension
        if not allowed_file(file.filename):
            errors.append(f'{file.filename}: Invalid file type')
            continue

        # Sanitize filename
        filename = secure_filename(file.filename)
        filepath = Path(app.config['UPLOAD_FOLDER']) / filename

        # Save file
        file.save(filepath)

        # Validate MIME type
        if not validate_mimetype(filepath):
            filepath.unlink()  # Delete invalid file
            errors.append(f'{filename}: MIME type validation failed')
            continue

        uploaded.append(str(filepath))

    return jsonify({
        'uploaded': uploaded,
        'count': len(uploaded),
        'errors': errors
    })
```

### Thumbnail Generation with Error Handling
```python
# Source: https://pillow.readthedocs.io/en/stable/reference/Image.html
from PIL import Image, ImageOps
from pathlib import Path
import logging

def generate_thumbnail(
    source_path: Path,
    thumb_dir: Path,
    size: tuple[int, int] = (200, 200)
) -> Path | None:
    """Generate thumbnail with EXIF orientation correction.

    Returns path to thumbnail or None on error.
    """
    try:
        # Ensure thumbnail directory exists
        thumb_dir.mkdir(parents=True, exist_ok=True)

        # Generate thumbnail filename
        thumb_filename = f"{source_path.stem}_thumb.jpg"
        thumb_path = thumb_dir / thumb_filename

        with Image.open(source_path) as img:
            # CRITICAL: Fix EXIF orientation
            img = ImageOps.exif_transpose(img)

            # Create copy (thumbnail modifies in-place)
            img_copy = img.copy()

            # Generate thumbnail with high-quality filter
            img_copy.thumbnail(size, Image.Resampling.LANCZOS)

            # Save with optimization
            img_copy.save(thumb_path, 'JPEG', quality=85, optimize=True)

        return thumb_path

    except Exception as e:
        logging.error(f"Thumbnail generation failed for {source_path}: {e}")
        return None
```

### SSE Progress Stream with Job Status
```python
# Source: https://maxhalford.github.io/blog/flask-sse-no-deps/
from flask import Response
import json
from app.models import Job

@app.route('/api/progress/<int:job_id>')
def stream_progress(job_id):
    def generate():
        # Verify job exists
        job = Job.query.get(job_id)
        if not job:
            yield format_sse(json.dumps({'error': 'Job not found'}))
            return

        # Poll job status (in production, use MessageAnnouncer pattern)
        while True:
            job = Job.query.get(job_id)

            data = {
                'job_id': job.id,
                'status': job.status.value,
                'progress_current': job.progress_current,
                'progress_total': job.progress_total,
                'current_filename': job.current_filename,
                'error_count': job.error_count,
            }

            yield format_sse(json.dumps(data))

            # Stop streaming when job completes
            if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                break

            time.sleep(1)  # Poll interval (use MessageAnnouncer in production)

    return Response(generate(), mimetype='text/event-stream')

def format_sse(data: str, event: str = None) -> str:
    msg = f'data: {data}\n\n'
    if event:
        msg = f'event: {event}\n{msg}'
    return msg
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling every 1-2 seconds | Server-Sent Events | ~2015 (widespread by 2020) | Reduced server load, eliminated header overhead, lower latency. SSE baseline browser support achieved August 2025. |
| jQuery for DOM manipulation | Vanilla JavaScript with modern APIs | 2020-2024 | No framework dependency, smaller bundle size, native browser APIs improved. querySelector/fetch/EventSource sufficient for Phase 3 needs. |
| Flask-SocketIO for all real-time | SSE for unidirectional updates | 2022-2025 | Lighter alternative when server→client only. WebSocket still preferred for bidirectional chat/games. |
| PIL (unmaintained since 2011) | Pillow (active fork) | 2013 | PIL never received Python 3 support. Pillow is maintained, Python 3 compatible, actively developed. |
| Manual EXIF parsing | ImageOps.exif_transpose() | Added Pillow 8.0 (2020) | Automatic orientation handling. Previously required manual ExifTags parsing and transform application. |
| pytz for timezones | zoneinfo (stdlib) | Python 3.9 (2020) | No external dependency, IANA timezone database. Project already standardized on zoneinfo in Phase 1. |

**Deprecated/outdated:**
- **Flask-Uploads (abandoned):** Last release 2016, incompatible with Flask 2.x+. Use native Flask file upload instead.
- **PIL (Python Imaging Library):** Unmaintained since 2011. Use Pillow (active fork).
- **Flask debug server in production:** Never use `flask run` in production. Use Gunicorn/uWSGI/Waitress.
- **`input[type=file] directory` attribute:** Non-standard, never standardized. Use `webkitdirectory` instead (baseline support August 2025).

## Open Questions

Things that couldn't be fully resolved:

1. **Thumbnail Generation Timing (Claude's Discretion)**
   - What we know: Two options: (A) generate during Huey processing task, (B) generate on-demand when results load
   - What's unclear: Performance tradeoff for 10k+ files. Option A adds ~50ms per file to processing. Option B delays results display but processes faster.
   - Recommendation: Generate during processing (Option A) for Phase 3. Thumbnails are small (10-20KB), generation is fast (<50ms with LANCZOS), and results display is immediate when job completes. For 10k files, adds ~8 minutes to total job time but eliminates wait when viewing results.

2. **Session Resume Implementation (Claude's Discretion)**
   - What we know: User decisions require "resume where left off" functionality. Options: (A) localStorage stores last job_id, (B) database tracks "current job" per session/user
   - What's unclear: v1 has no authentication, so session/user tracking is ambiguous. Multiple users on same machine would conflict.
   - Recommendation: localStorage approach (Option A) for v1. Store `{lastJobId, timestamp}` in localStorage on job creation. On page load, check if job exists and is incomplete, offer "Resume job" or "Start new" option. Simple, works for single-user v1 scope.

3. **Settings Persistence (Claude's Discretion)**
   - What we know: User decisions specify "Claude picks persistence strategy: database vs session-only with env var defaults"
   - What's unclear: Trade-off between simplicity (env vars only) vs flexibility (database settings table)
   - Recommendation: Environment variables only for v1 (UPLOAD_FOLDER, OUTPUT_DIR, TIMEZONE). No settings UI needed—deploy-time configuration via `.env` file. Simpler, no database schema changes, no settings CRUD routes. Phase 5+ can add database settings when multi-user or per-job configuration needed.

4. **Progress Update Mechanism (Claude's Discretion)**
   - What we know: User decisions specify "polling vs SSE based on complexity tradeoff"
   - What's unclear: Does MessageAnnouncer pattern (in-memory queue) work with multiple Gunicorn workers, or does it require Redis pubsub?
   - Recommendation: START with simple polling (1-2 second interval) in v1 for deployment simplicity. MessageAnnouncer only works in single-process (development) or with shared state (Redis). Polling adds header overhead but eliminates Redis dependency and multi-worker complexity. Phase 3 focuses on UI shell; optimize to SSE in Phase 7 if polling proves problematic.

## Sources

### Primary (HIGH confidence)
- [Flask File Uploads - Official Documentation](https://flask.palletsprojects.com/en/stable/patterns/fileuploads/) - Upload patterns, security, configuration
- [Pillow 12.1.0 Documentation](https://pillow.readthedocs.io/en/stable/reference/Image.html) - Thumbnail method, resampling filters
- [MDN: HTMLInputElement.webkitdirectory](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory) - Browser compatibility, usage, limitations
- [Flask Configuration - Official Documentation](https://flask.palletsprojects.com/en/stable/config/) - MAX_CONTENT_LENGTH, SECRET_KEY
- [alexwlchan: EXIF Orientation Issue](https://alexwlchan.net/til/2024/photos-can-have-orientation-in-exif/) - EXIF orientation problem and exif_transpose() solution
- [Max Halford: Flask SSE Without Dependencies](https://maxhalford.github.io/blog/flask-sse-no-deps/) - MessageAnnouncer pattern, generator streaming

### Secondary (MEDIUM confidence)
- [Handling File Uploads With Flask - Miguel Grinberg](https://blog.miguelgrinberg.com/post/handling-file-uploads-with-flask) - Practical patterns, chunking for large files
- [Secure File Uploads in Flask - HackerOne/PullRequest](https://www.pullrequest.com/blog/secure-file-uploads-in-flask-filtering-and-validation-techniques/) - Security validation techniques
- [GeeksforGeeks: Upload Multiple Files with Flask](https://www.geeksforgeeks.org/python/upload-multiple-files-with-flask/) - request.files.getlist() examples
- [WebSearch: Flask SSE vs Polling Performance (2026)](https://www.velotio.com/engineering-blog/how-to-implement-server-sent-events-using-python-flask-and-react) - SSE reduces latency and server load vs polling
- [WebSearch: Flask Production Pitfalls (2026)](https://www.sourcery.ai/vulnerabilities/python-flask-security-audit-debug-enabled) - Debug mode and SECRET_KEY security issues
- [WebSearch: Vanilla JavaScript Trend (2026)](https://thenewstack.io/why-developers-are-ditching-frameworks-for-vanilla-javascript/) - Framework-free pattern adoption in 2026

### Tertiary (LOW confidence - marked for validation)
- WebSearch results on CSS Grid accordion patterns - Modern approaches using grid-template-rows
- WebSearch results on multi-select shift-click patterns - Community patterns for checkbox range selection
- WebSearch results on Huey background task integration - Limited official documentation, needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Flask/Pillow/Werkzeug official docs verified, Pillow 12.1.0 released Jan 2026
- Architecture: HIGH - Flask upload and SSE patterns verified from official docs and trusted sources
- Pitfalls: HIGH - Security pitfalls documented in official Flask docs and security articles
- Progress mechanism recommendation (polling): MEDIUM - Polling vs SSE tradeoff based on deployment complexity, not performance testing
- Thumbnail timing recommendation: MEDIUM - Based on typical thumbnail generation performance, not tested on actual hardware
- Settings persistence recommendation: MEDIUM - Environment variables simplest for v1, but database approach may be needed sooner for UX

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days) - Flask and Pillow stable, slow-moving ecosystem
