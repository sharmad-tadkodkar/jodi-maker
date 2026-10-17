"""API contract (spec §6 + §7). The frontend's TypeScript types are generated from these models
via /openapi.json — change a shape here and both sides see it. Tell your partner when you do."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# ---------- Enums ----------

Gender = Literal["male", "female"]
Role = Literal["candidate", "parent"]
UserStatus = Literal["onboarding", "active", "in_focus", "locked", "paused"]
Visibility = Literal["public", "agent_only", "private"]
AspectCategory = Literal[
    "values", "family_structure", "career_ambition", "lifestyle", "location_plans", "finances",
    "faith_practice", "communication_style", "interests", "partner_expectations", "dealbreakers",
]
ASPECT_CATEGORIES: list[str] = list(AspectCategory.__args__)
Dimension = Literal["values", "family_fit", "lifestyle", "career", "location", "communication"]
DIMENSIONS: list[str] = list(Dimension.__args__)
MatchStatus = Literal[
    "queued", "screening", "briefed", "awaiting_them", "focus_week", "locked", "closed"
]
Decision = Literal["interested", "pass"]
FocusDecision = Literal["continue", "stop", "extend"]
JobStatus = Literal["pending", "running", "done", "error"]


# ---------- Users & profile ----------

class HardCriteria(BaseModel):
    age_min: int = 21
    age_max: int = 40
    cities: list[str] = []
    open_to_relocate: bool = False
    education_min: str | None = None  # "bachelors" | "masters" | "doctorate"
    professions: list[str] = []
    income_band_min: str | None = None  # e.g. "10-20L"
    community_pref: str | None = None  # user-set only; never inferred
    diet: str | None = None  # "veg" | "non_veg" | "eggetarian" | "vegan" | "any"
    marital_status: list[str] = ["never_married"]
    languages: list[str] = []


class HardCriteriaPatch(BaseModel):
    age_min: int | None = None
    age_max: int | None = None
    cities: list[str] | None = None
    open_to_relocate: bool | None = None
    education_min: str | None = None
    professions: list[str] | None = None
    income_band_min: str | None = None
    community_pref: str | None = None
    diet: str | None = None
    marital_status: list[str] | None = None
    languages: list[str] | None = None


class SelfFacts(BaseModel):
    age: int | None = None
    city: str | None = None
    education: str | None = None
    profession: str | None = None
    income_band: str | None = None
    community: str | None = None
    diet: str | None = None
    marital_status: str | None = None
    languages: list[str] = []
    height_cm: int | None = None


class PreferenceWeights(BaseModel):
    values: float = 1 / 6
    family_fit: float = 1 / 6
    lifestyle: float = 1 / 6
    career: float = 1 / 6
    location: float = 1 / 6
    communication: float = 1 / 6


class User(BaseModel):
    id: str
    name: str
    gender: Gender
    seeking_gender: Gender
    role: Role = "candidate"
    linked_candidate_id: str | None = None
    status: UserStatus = "onboarding"
    photo_url: str | None = None
    is_seed: bool = False
    hard_criteria: HardCriteria = HardCriteria()
    self_facts: SelfFacts = SelfFacts()
    preference_weights: PreferenceWeights = PreferenceWeights()
    intake_completeness: float = 0.0
    active_match_id: str | None = None  # set while in_focus / locked
    created_at: datetime | None = None
    last_active_at: datetime | None = None


class CreateUserRequest(BaseModel):
    name: str
    gender: Gender
    role: Role = "candidate"


class Aspect(BaseModel):
    id: str
    category: AspectCategory
    statement: str
    evidence: str
    source: str = "intake"  # "intake" | "upload:<name>" | "parent" | "learned"
    confidence: float = Field(ge=0, le=1)
    visibility: Visibility = "agent_only"
    created_at: datetime | None = None


class AspectPatch(BaseModel):
    statement: str | None = None
    visibility: Visibility | None = None


# ---------- Intake ----------

class IntakeMessage(BaseModel):
    id: str
    role: Literal["agent", "user"]
    text: str
    created_at: datetime | None = None


class IntakeMessageRequest(BaseModel):
    text: str


class IntakeMessageResponse(BaseModel):
    reply: str
    completeness: float  # 0..1 — show as "Your matchmaker knows you 70%"
    missing_categories: list[AspectCategory] = []
    new_aspects: list[Aspect] = []
    done: bool = False  # completeness reached threshold


class LearningEntry(BaseModel):
    id: str
    match_id: str
    decision: str
    reason: str | None = None
    old_weights: PreferenceWeights
    new_weights: PreferenceWeights
    explanation: str
    created_at: datetime | None = None


# ---------- Jobs ----------

class JobRef(BaseModel):
    job_id: str


class Job(BaseModel):
    id: str
    kind: str
    status: JobStatus
    progress: str | None = None
    result: dict | None = None
    error: str | None = None


# ---------- Matching ----------

class CandidateSummary(BaseModel):
    user_id: str
    display_name: str  # first name + initial, e.g. "Meera S."
    age: int | None = None
    city: str | None = None
    profession: str | None = None
    verified: bool = True  # mocked badge
    is_new: bool = False


class Scores(BaseModel):
    overall: float = 0
    values: float = 0
    family_fit: float = 0
    lifestyle: float = 0
    career: float = 0
    location: float = 0
    communication: float = 0
    reasons: dict[str, str] = {}  # dimension -> one-line reason


class PipelineItem(BaseModel):
    match_id: str
    candidate: CandidateSummary
    scores: Scores
    status: MatchStatus


class PipelineResponse(BaseModel):
    count: int
    paused: bool = False  # true while the user is in a Focus Week or locked
    items: list[PipelineItem]


class Match(BaseModel):
    id: str
    user_a: str
    user_b: str
    status: MatchStatus
    scores: Scores = Scores()
    decision_a: Decision | None = None
    decision_b: Decision | None = None
    pass_reason_a: str | None = None
    pass_reason_b: str | None = None
    closed_reason: str | None = None
    briefed_at: datetime | None = None
    mutual_at: datetime | None = None
    focus_start: datetime | None = None
    focus_end: datetime | None = None
    extended: bool = False
    created_at: datetime | None = None


# ---------- Interview ----------

class InterviewRequest(BaseModel):
    instructions: str | None = None  # P1 "Brief your matchmaker"


class InterviewTurn(BaseModel):
    id: str
    round: Literal[1, 2, 3]
    speaker: Literal["agent_a", "agent_b", "moderator"]
    speaker_name: str  # e.g. "Arjun's matchmaker"
    text: str
    highlight: Literal["green", "yellow"] | None = None
    turn_index: int


class InterviewResponse(BaseModel):
    status: Literal["not_started", "running", "done", "ended_dealbreaker"]
    turns: list[InterviewTurn]
    round_summaries: list[str] = []


# ---------- Brief ----------

class FlagItem(BaseModel):
    text: str
    evidence: str


class WhyFitItem(BaseModel):
    dimension: Dimension
    score: float
    reason: str


class Brief(BaseModel):
    match_id: str
    for_user_id: str
    candidate: CandidateSummary
    compatibility: float  # 0..100
    snapshot: str
    why_fit: list[WhyFitItem]
    green_flags: list[FlagItem]
    explore: list[FlagItem]
    questions_only_you: list[str]
    family_fit: str
    generated_at: datetime | None = None


class DecisionRequest(BaseModel):
    user_id: str
    decision: Decision
    reason: str | None = None  # required for "pass": a chip value or "other: <text>"


class LearningResult(BaseModel):
    old_weights: PreferenceWeights
    new_weights: PreferenceWeights
    explanation: str  # "You weighted family closeness higher than you told me..."
    new_aspects: list[Aspect] = []
    moved_up: int = 0  # candidates that moved up after re-rank


class DecisionResponse(BaseModel):
    match: Match
    mutual: bool
    learning: LearningResult | None = None


# ---------- Focus Week ----------

class FocusState(BaseModel):
    match_id: str
    day: int  # 1..14
    total_days: int  # 7, or 14 if extended
    status: MatchStatus
    ends_at: datetime | None = None
    partner: CandidateSummary
    deck_today: list[str]  # today's 3 prompts
    decision_me: FocusDecision | None = None
    decision_them_submitted: bool = False  # never reveal *what* they chose before both decide
    extended: bool = False


class ChatMessage(BaseModel):
    id: str
    sender_id: str
    text: str
    created_at: datetime | None = None


class ChatPost(BaseModel):
    sender_id: str
    text: str


class FocusDecisionRequest(BaseModel):
    user_id: str
    decision: FocusDecision
    reason: str | None = None  # required for "stop"


class FocusDecisionResponse(BaseModel):
    match: Match
    outcome: Literal["pending", "locked", "closed", "extended"]
    learning: LearningResult | None = None


# ---------- Demo ----------

class Persona(BaseModel):
    user_id: str
    name: str
    role: Role
    tagline: str


class SeedRequest(BaseModel):
    count: int = 60  # world size (heroes and reserves come on top)


class SimulateResponseRequest(BaseModel):
    match_id: str
    user_id: str  # the *other* side whose response we're simulating
    decision: Decision


class FastForwardRequest(BaseModel):
    match_id: str
    day: int


class InterviewStarted(BaseModel):
    match_id: str
    job_id: str
    candidate: CandidateSummary


class HeroState(BaseModel):
    user_id: str
    name: str
    status: UserStatus
    active_match_id: str | None = None
    focus_day: int | None = None  # set while in a Focus Week
    queue_size: int = 0
    next_brief_match_id: str | None = None


class DemoState(BaseModel):
    """One-glance demo panel status."""
    heroes: list[HeroState]
    hero_match_status: MatchStatus | None = None  # Arjun–Meera
    profiles: int
    reserves_left: int


class OkResponse(BaseModel):
    ok: bool = True
    detail: str | None = None
