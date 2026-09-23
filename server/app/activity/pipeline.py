"""The activity pipeline: one recording in, one processed activity out.

Like Strava's upload → processing model, the pipeline is the only way a recording becomes an
activity. Stages:

    ingest    landmark streams are validated against the versioned contract (analysis.schemas)
    detect    the rules classifier names the exercise; the LLM second opinion resolves doubt
    segment   hysteresis rep counting on the primary joint (opposite-side and proxy fallbacks)
    grade     each rep scored 0–100 against the exercise's templated checks
    enrich    the report is folded into the persistable session shape, muscle load included

detect → segment → grade run inside ``analysis.engine.analyze``; this module owns the stage
boundaries so routes and services never touch the engine directly. CPU-bound and synchronous —
callers run it in a threadpool.
"""
from dataclasses import dataclass

from ..analysis.engine import PROPOSED, analyze
from ..analysis.persistence import session_from_report
from ..analysis.schemas import AnalysisRequest
from ..schemas import EndSessionPayload

STAGES = ('ingest', 'detect', 'segment', 'grade', 'enrich')


@dataclass
class ProcessedActivity:
    """Pipeline output: the engine report plus the derived session payload."""
    report: dict

    @property
    def scored(self) -> bool:
        """Only a detected/confirmed exercise with graded reps becomes a log entry."""
        report = self.report
        return bool(report['score'] is not None and report['repCount']
                    and report['exercise'] and report['exercise'] != PROPOSED)

    def session_payload(self, workout_id: str | None = None) -> EndSessionPayload:
        """The enrich stage: report → legacy session shape (muscle load, per-rep rows)."""
        return session_from_report(self.report, workout_id)


def process(payload: AnalysisRequest, library, detector=None, coach=None) -> ProcessedActivity:
    """ingest → detect → segment → grade. Raises ValueError on contract or timeline violations."""
    return ProcessedActivity(analyze(payload, library, detector, coach))
