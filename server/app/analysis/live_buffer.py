"""Server-side frame buffer for the live loop.

The live HUD re-analyses the whole set every few seconds. Re-uploading every frame each tick made
requests grow without bound (several MB late in a set), so the client sends only the frames it has
not sent yet (``fromIndex`` = how many it already sent). If the counts disagree — API restart, a
different process, an expired entry — ``append`` raises ``Mismatch`` and the client re-sends from 0.
In-memory and per process; the final, persisted evaluation still uploads the full set.
"""
from __future__ import annotations
import threading
import time

TTL_SECONDS = 15 * 60
MAX_SESSIONS = 500
MAX_FRAMES = 1800   # same cap as CameraStream: older frames roll off the analysed window


class Mismatch(Exception):
    def __init__(self, expected: dict[str, int]):
        super().__init__('Live buffer out of sync')
        self.expected = expected


class LiveBuffer:
    def __init__(self):
        self._sessions: dict[tuple[str, str], dict] = {}
        self._lock = threading.Lock()

    def append(self, owner: str, session_key: str, streams) -> list[dict]:
        """Add new frames; return every buffered stream as plain dicts (meta + frames)."""
        now = time.time()
        with self._lock:
            self._sessions = {k: v for k, v in self._sessions.items() if now - v['at'] < TTL_SECONDS}
            if len(self._sessions) >= MAX_SESSIONS and (owner, session_key) not in self._sessions:
                oldest = min(self._sessions, key=lambda k: self._sessions[k]['at'])
                del self._sessions[oldest]
            entry = self._sessions.setdefault((owner, session_key), {'at': now, 'streams': {}})
            stored = entry['streams']
            expected = {s.cameraId: stored.get(s.cameraId, {'count': 0})['count'] for s in streams}
            if any(s.fromIndex != expected[s.cameraId] for s in streams) or set(stored) - set(expected):
                # Start over cleanly; the client re-sends everything from index 0.
                entry['streams'] = {}
                raise Mismatch({k: 0 for k in expected})
            for s in streams:
                current = stored.setdefault(s.cameraId, {'count': 0, 'frames': []})
                frames = current['frames']
                if s.frames and frames and s.frames[0].timestampMs <= frames[-1].timestampMs:
                    entry['streams'] = {}
                    raise Mismatch({k: 0 for k in expected})
                frames.extend(s.frames)
                del frames[:-MAX_FRAMES]
                current['count'] += len(s.frames)
                current['meta'] = {'cameraId': s.cameraId, 'view': s.view, 'aspectRatio': s.aspectRatio, 'offsetMs': s.offsetMs}
            entry['at'] = now
            return [{**v['meta'], 'frames': list(v['frames'])} for v in stored.values()]

    def drop(self, owner: str, session_key: str):
        with self._lock:
            self._sessions.pop((owner, session_key), None)
