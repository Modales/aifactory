"""Activity domain — the Strava-style core of the backend.

A recorded set is an *activity*: it is uploaded once, processed by the pipeline, persisted,
and everything else (training log, feed, stats, coach debrief) hangs off it. The older
evaluate → save → share endpoints remain as a compatibility layer for the current frontend;
new clients should use ``/api/activities`` only.
"""
