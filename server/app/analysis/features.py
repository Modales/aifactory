"""Per-frame 2D pose features shared by the classifier, the rep segmenter and the form checks.

Every value is either a measured 2D joint angle (degrees), a trunk lean from vertical, or a
distance normalised by torso length. ``None`` means "not visible enough to trust"; nothing
downstream ever invents a value for a missing joint.
"""
from math import acos, degrees, hypot
from statistics import median
from .schemas import CameraStream

VIS = .55   # MediaPipe reports lower visibility for prone/floor positions (push-ups, planks) than for standing
ANGLE_KEYS = ('knee', 'hip', 'elbow', 'shoulder', 'ankle')
# MediaPipe indices: shoulder 11/12, elbow 13/14, wrist 15/16, hip 23/24, knee 25/26, ankle 27/28, foot 31/32.


def angle(a, b, c):
    u, v = (a[0]-b[0], a[1]-b[1]), (c[0]-b[0], c[1]-b[1])
    length = hypot(*u) * hypot(*v)
    if length < 1e-6:
        return None
    return degrees(acos(max(-1, min(1, (u[0]*v[0]+u[1]*v[1])/length))))


def dominant_side(stream: CameraStream):
    """One anatomical side for the whole stream; switching sides mid-rep manufactures motion."""
    return max((0, 1), key=lambda side: sum(
        frame.landmarks[i+side].visibility for frame in stream.frames for i in (11, 13, 15, 23, 25, 27)))


def frame_features(p, side, ratio):
    def point(i):
        return (p[i].x * ratio, p[i].y)

    def seen(*indices):
        return all(p[i].visibility >= VIS and -.05 <= p[i].x <= 1.05 and -.05 <= p[i].y <= 1.05 for i in indices)

    def joint(*indices):
        return angle(*(point(i) for i in indices)) if seen(*indices) else None

    s, e, w, h, k, a, f = (i+side for i in (11, 13, 15, 23, 25, 27, 31))
    o = 1 - side
    os_, oe, ow, oh, ok, oa, of_ = (i+o for i in (11, 13, 15, 23, 25, 27, 31))
    shoulder, hip = point(s), point(h)
    torso = max(hypot(shoulder[0]-hip[0], shoulder[1]-hip[1]), .01)
    torso_seen = seen(s, h)
    norm = lambda dy: dy / torso

    knee, hip_angle, elbow = joint(h, k, a), joint(s, h, k), joint(s, e, w)
    other_knee, other_elbow = joint(oh, ok, oa), joint(os_, oe, ow)
    row = {
        'knee': knee, 'hip': hip_angle, 'elbow': elbow,
        'shoulder': joint(e, s, h),               # arm hanging ≈ 15°, forward/horizontal ≈ 90°, overhead ≈ 170°
        'ankle': joint(k, a, f),                  # plantar-flexion opens this angle
        'otherKnee': other_knee, 'otherElbow': other_elbow, 'otherHip': joint(os_, oh, ok),
        # Opposite-side angles let rep counting fail over when the dominant side is occluded.
        'otherShoulder': joint(oe, os_, oh), 'otherAnkle': joint(ok, oa, of_),
        'kneeAsym': abs(knee-other_knee) if knee is not None and other_knee is not None else None,
        'trunk': degrees(acos(min(1, abs(shoulder[1]-hip[1])/torso))) if torso_seen else None,   # 0 upright, 90 horizontal
        'wristY': norm(shoulder[1]-point(w)[1]) if seen(s, w) else None,                        # + wrist above shoulder
        'wristHip': norm(hip[1]-point(w)[1]) if seen(h, w) else None,                            # + wrist above hip
        'kneeHip': norm(hip[1]-point(k)[1]) if seen(h, k) else None,                             # + knee above hip
        'hipAnkle': norm(point(a)[1]-hip[1]) if seen(h, a) else None,                            # standing ≈ 2, seated ≈ 1, lying ≈ 0
        'reach': norm(abs(point(w)[0]-shoulder[0])) if seen(s, w) else None,                     # arm forward of the shoulder
        'shoulderDrift': norm(abs(point(e)[0]-shoulder[0])) if seen(s, e) else None,
        'overhead': (point(w)[1] < shoulder[1] - torso*.2) if seen(s, w) else None,
        'footSplit': norm(abs(point(a)[0]-point(oa)[0])) if seen(a, oa) else None,              # side view: feet apart front-to-back (lunge) vs together (squat)
        'hipAsym': abs(hip_angle-joint(os_, oh, ok)) if hip_angle is not None and joint(os_, oh, ok) is not None else None,
        # Raw image positions (aspect-corrected) — used only to describe how the body travels
        # through the frame: hips pinned to a seat/pad vs moving through space.
        'torsoLen': torso if torso_seen else None,
        # Signed lean: + shoulders ahead of the hips in the facing direction (hinged forward),
        # − behind them (reclined against a pad or seat back). Facing comes from the nose.
        'leanFwd': norm((shoulder[0]-hip[0]) * (1 if point(0)[0] > shoulder[0] else -1))
                   if torso_seen and seen(0) and abs(point(0)[0]-shoulder[0]) > .15 * torso else None,
        'hipPx': hip[0] if seen(h) else None, 'hipPy': hip[1] if seen(h) else None,
        'wristPx': point(w)[0] if seen(w) else None, 'wristPy': point(w)[1] if seen(w) else None,
        'anklePx': point(a)[0] if seen(a) else None, 'anklePy': point(a)[1] if seen(a) else None,
    }
    # Frontal-view geometry (both sides needed).
    row['width'] = abs(point(11)[0]-point(12)[0]) / torso if seen(11, 12, 23, 24) else None
    if seen(25, 26, 27, 28):
        stance = abs(point(27)[0]-point(28)[0])
        row['stance'] = stance
        row['alignment'] = abs(point(25)[0]-point(27)[0]) + abs(point(26)[0]-point(28)[0])
        row['kneeTrack'] = row['alignment'] / stance if stance > .1 else None
    else:
        row['stance'], row['alignment'], row['kneeTrack'] = None, None, None
    row['handsApart'] = norm(abs(point(15)[0]-point(16)[0])) if seen(15, 16) else None
    return row


def features(stream: CameraStream):
    side = dominant_side(stream)
    rows = []
    for frame in stream.frames:
        row = frame_features(frame.landmarks, side, stream.aspectRatio)
        row['t'] = frame.timestampMs + stream.offsetMs
        rows.append(row)
    widths = [r['width'] for r in rows if r['width'] is not None]
    inferred = 'unknown' if not widths else 'side' if median(widths) < .38 else 'frontal' if median(widths) > .72 else 'oblique'
    view = stream.view if stream.view != 'auto' else inferred
    return {'id': stream.cameraId, 'view': view, 'viewSource': 'estimated' if stream.view == 'auto' else 'user-confirmed', 'rows': rows}


def values(rows, key):
    return [r[key] for r in rows if r.get(key) is not None]


def percentile(items, share):
    ordered = sorted(items)
    return ordered[int((len(ordered) - 1) * share)]


def extrema_envelope(rows, key, min_range):
    """(lo, hi) envelope of a signal's alternating prominent extrema, or None.

    Frame-count percentiles drift toward the rest position in rest-heavy sets — stand still
    long enough and p10/p90 both read "standing", so gates derived from them never open. Every
    rep contributes exactly one high and one low extremum no matter how long the rests are, so
    gates derived from extrema stay honest. Single-frame spikes are absorbed by the same
    trailing median-of-3 smoothing the segmenter uses; swings smaller than ``min_range`` are
    ignored, and the trailing (unconfirmed) extreme still counts, so one partial rep is enough.
    """
    items = [r[key] for r in rows if r.get(key) is not None]
    if len(items) < 5:
        return None
    sm = [median(items[max(0, i - 2):i + 1]) for i in range(len(items))]
    extrema = []                        # confirmed alternating extrema, (kind, value); kind +1 high, -1 low
    ext = run_hi = run_lo = sm[0]       # ext = extreme of the current leg
    trend = 0                           # +1 rising leg, -1 falling leg, 0 undecided
    for v in sm[1:]:
        run_hi, run_lo = max(run_hi, v), min(run_lo, v)
        if trend == 0:
            # No leg yet: wait for the first real swing, then lock the start side — otherwise a
            # set that begins by descending would lose its starting high before it confirms.
            if run_hi - run_lo >= min_range:
                if abs(v - run_lo) <= abs(v - run_hi):
                    extrema.append((1, run_hi))
                    trend, ext = -1, v
                else:
                    extrema.append((-1, run_lo))
                    trend, ext = 1, v
        elif trend > 0:
            if v >= ext:
                ext = v
            elif ext - v >= min_range:  # fell min_range from the running high: the high is confirmed
                extrema.append((1, ext))
                trend, ext = -1, v
        else:
            if v <= ext:
                ext = v
            elif v - ext >= min_range:  # rose min_range from the running low: the low is confirmed
                extrema.append((-1, ext))
                trend, ext = 1, v
    if not extrema:
        return None
    extrema.append((trend, ext))        # trailing leg: a partial rep still informs the gates
    highs = [v for kind, v in extrema if kind == 1]
    lows = [v for kind, v in extrema if kind == -1]
    if not highs or not lows:
        return None
    lo, hi = median(lows), median(highs)
    return (lo, hi) if hi - lo >= min_range else None


def stat(rows, key, name, coverage=.6):
    """Named statistic over a window of rows; None when the joint was not visible enough."""
    items = values(rows, key)
    if len(items) < max(4, len(rows) * coverage):
        return None
    if name == 'range':
        return percentile(items, .9) - percentile(items, .1)
    if name == 'median':
        return median(items)
    if name == 'p10':
        return percentile(items, .1)
    if name == 'p90':
        return percentile(items, .9)
    if name == 'start':
        return sum(items[:3]) / len(items[:3])
    if name == 'pct':
        return 100 * sum(1 for v in items if v) / len(items)
    raise KeyError(name)
