# Phase 2: Background Workers + Core Processing - Context

**Gathered:** 2026-02-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Background workers process imported files asynchronously — extracting metadata, calculating confidence scores for timestamp detection, and computing perceptual hashes. Processing runs without blocking the web UI. Workers handle batch jobs with progress tracking, error handling, and multi-threaded execution.

</domain>

<decisions>
## Implementation Decisions

### Confidence Scoring

- **Selection strategy:** Pick earliest valid timestamp that passes sanity checks
- **Sanity floor:** Configurable minimum year (user sets per-import, avoids 1970 epoch dates)
- **Weighted scoring:** Sources have different weights; agreement boosts confidence
  - EXIF DateTimeOriginal > DateTimeDigitized > DateTime (different reliability weights)
  - Multiple sources agreeing within tolerance increases confidence
  - Source disagreement lowers confidence
- **Confidence levels:** HIGH (strong agreement/EXIF), MEDIUM (single reliable source), LOW (conflicts or no sources)
- **No timestamp data:** Treated as LOW confidence (goes to review queue, user provides timestamp)
- **Store all candidates:** Database stores all detected timestamps with source info, not just the winner — enables side-by-side comparison in review UI (Phase 4)

### Progress Reporting

- **Status model:** Jobs have statuses: PENDING, RUNNING, PAUSED, COMPLETED, CANCELLED, HALTED
- **Progress display:** Current filename + count/total + percentage + rate (files/sec) + estimated time remaining
- **Result categories:** Files sorted into buckets after processing:
  - Successful — HIGH confidence, ready for output
  - Low Confidence — needs timestamp review (Phase 4)
  - Duplicate — detected as duplicate (Phase 5/6 review)
  - Unprocessable — file cannot be read at all
- **Job success:** Job marked COMPLETED if it runs to completion, regardless of individual file outcomes

### Error Handling

- **Continue on file errors:** Log error, mark file as Unprocessable, continue with batch
- **Error threshold:** Halt job if failure rate exceeds ~10% — prevents wasting time on bad batches
- **Error logging:** Capture error type + message + filename for unprocessable files
- **Unprocessable files:** Copy to `storage/unprocessable/` folder for easy user access
- **Threshold halt behavior:** Preserve already-processed files, offer user choice: resume remaining, retry failures, or start fresh
- **Format recovery:** Attempt to read files as different formats if extension doesn't match magic bytes
- **System errors:** Fail immediately on transient errors (disk full, memory) — need user intervention, not retry

### Processing Order

- **File order:** Process in filename order (alphabetical) — predictable, matches file browser
- **Multi-threading:** Thread pool with shared queue (Claude's discretion on implementation)
- **Thread count:** Auto-detect CPU cores by default, configurable override in settings
- **Job queuing:** One job at a time — block new job creation while one is running
- **Batch size:** No artificial limit, process via streaming — progress UI sets user expectations
- **Cancellation:** Graceful stop — finish current file, preserve progress, set status to CANCELLED
- **Pause/Resume:** Support PAUSED status with exact resume from where it stopped
- **Job controls:** Widget with progress bar, count/percentage, pause/kill buttons (UI is Phase 3, status model is Phase 2)

### Claude's Discretion

- Progress update granularity (per-file vs batch checkpoints — balance accuracy vs DB overhead)
- Thread pool vs chunk-based parallelism for multi-threading
- Notification method for halted jobs (status page, browser notification, etc.)
- Specific tolerance values for timestamp agreement

</decisions>

<specifics>
## Specific Ideas

- "Pick the earliest available time found within reason" — mirrors original CLI behavior
- Job status widget should show real-time progress with pause/kill controls
- The whole purpose is to FIX bad/missing metadata — files with missing timestamps aren't failures, they're the normal workflow via review queue
- Processing order should allow timestamp correction (Phase 4) before duplicate review (Phase 5/6) — already handled by phase ordering in roadmap

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-background-workers-core-processing*
*Context gathered: 2026-02-02*
