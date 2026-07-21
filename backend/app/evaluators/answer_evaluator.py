"""
Answer evaluator.

Evaluation strategy (per the project spec):
  1. Deterministic for structured answers: IP, domain, hash, MITRE ID, username, hostname.
  2. Keyword matching for short free-text answers.
  3. Multiple-choice: exact match against correct_answer.
  4. Full AI evaluation is reserved for the final report (not implemented here to keep
     the MVP self-contained and free of mandatory API calls).
"""

import re
from app.models.question import Question


def _normalize(text: str) -> str:
    return text.strip().lower()


def _check_keywords(answer_text: str, required_keywords: list) -> tuple[bool, float]:
    """Return (passed, fraction_matched). Partial credit for keyword answers."""
    if not required_keywords:
        return True, 1.0
    answer_lower = answer_text.lower()
    matched = sum(1 for kw in required_keywords if kw.lower() in answer_lower)
    fraction = matched / len(required_keywords)
    return fraction >= 0.5, fraction


def evaluate_answer(question: Question, answer_text: str) -> tuple[bool, float, str]:
    """
    Returns (is_correct, points_awarded, feedback).
    """
    if not answer_text or not answer_text.strip():
        return False, 0.0, "No answer provided."

    qtype = (question.question_type or "text").lower()
    correct = (question.correct_answer or "").strip()
    max_pts = float(question.points or 10)

    # ── Multiple choice ────────────────────────────────────────────────────────
    if qtype == "multiple_choice":
        if _normalize(answer_text) == _normalize(correct):
            return True, max_pts, "Correct!"
        return False, 0.0, f"Incorrect. The correct answer was: {correct}"

    # ── Structured / deterministic fields ─────────────────────────────────────
    if qtype in ("ip_domain", "mitre", "ip", "domain", "hash", "username", "hostname"):
        if _normalize(answer_text) == _normalize(correct):
            return True, max_pts, "Correct!"
        return False, 0.0, f"Incorrect. Expected: {correct}"

    # ── Timeline ordering ──────────────────────────────────────────────────────
    if qtype == "timeline":
        # Accept if normalized strings match
        if _normalize(answer_text) == _normalize(correct):
            return True, max_pts, "Correct timeline order!"
        return False, 0.0, "Incorrect order. Review the event timeline."

    # ── Free-text / summary – keyword matching ─────────────────────────────────
    keywords = question.required_keywords or []
    if keywords:
        passed, fraction = _check_keywords(answer_text, keywords)
        pts = round(max_pts * fraction, 1)
        if passed:
            return True, pts, f"Good answer! ({int(fraction*100)}% of key concepts covered)"
        return False, pts, (
            f"Partially correct ({int(fraction*100)}%). "
            f"Key concepts to include: {', '.join(keywords)}"
        )

    # No keywords and no correct_answer – give full credit for any non-empty answer
    return True, max_pts, "Answer recorded."
