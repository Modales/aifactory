from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class WorkoutSessionRecord(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    exercise_id: Mapped[str] = mapped_column(String)
    exercise_name: Mapped[str] = mapped_column(String)
    camera_angle: Mapped[str] = mapped_column(String)
    duration_seconds: Mapped[float] = mapped_column(Float)
    total_reps: Mapped[int] = mapped_column(Integer)
    avg_form_score: Mapped[float] = mapped_column(Float)
    peak_effort: Mapped[float] = mapped_column(Float)
    reps: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
