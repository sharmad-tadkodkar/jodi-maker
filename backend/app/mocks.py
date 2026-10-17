"""Mock payloads for stubbed endpoints. Shapes match app/models.py exactly; each endpoint swaps
to real data as its phase lands. Keep realistic — the frontend is built against these."""
from datetime import datetime, timedelta, timezone

from app import models as m

NOW = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
ARJUN, MEERA, ARJUN_PARENT = "arjun", "meera", "arjun_parent"
MATCH = "m_arjun_meera"


def user(user_id: str = ARJUN) -> m.User:
    if user_id == MEERA:
        return m.User(
            id=MEERA, name="Meera Sen", gender="female", seeking_gender="male", status="active",
            is_seed=True, intake_completeness=0.86, created_at=NOW,
            self_facts=m.SelfFacts(age=27, city="Bangalore", education="masters",
                                   profession="Product Designer", income_band="20-30L",
                                   diet="non_veg", marital_status="never_married",
                                   languages=["English", "Bengali", "Hindi"]),
            hard_criteria=m.HardCriteria(age_min=26, age_max=33, cities=["Bangalore"],
                                         education_min="bachelors", languages=["English"]),
        )
    return m.User(
        id=ARJUN, name="Arjun Mehta", gender="male", seeking_gender="female", status="active",
        is_seed=True, intake_completeness=0.72, created_at=NOW,
        self_facts=m.SelfFacts(age=28, city="Kolkata", education="bachelors",
                               profession="Software Engineer", income_band="20-30L",
                               diet="non_veg", marital_status="never_married",
                               languages=["English", "Hindi", "Bengali"], height_cm=178),
        hard_criteria=m.HardCriteria(age_min=24, age_max=30, cities=["Kolkata", "Bangalore"],
                                     open_to_relocate=True, education_min="bachelors",
                                     languages=["English", "Hindi"]),
        preference_weights=m.PreferenceWeights(values=0.22, family_fit=0.2, lifestyle=0.15,
                                               career=0.15, location=0.13, communication=0.15),
    )


def aspects() -> list[m.Aspect]:
    rows = [
        ("values", "Family comes first, but wants a partner who has her own ambitions.",
         "\"My parents matter a lot to me, but I don't want someone who just fits in.\"", 0.9, "public"),
        ("family_structure", "Lives in a joint family in Kolkata with parents and grandmother.",
         "\"It's me, my parents and my dadi at home.\"", 0.95, "public"),
        ("location_plans", "Moving to Bangalore next year for work.",
         "\"I'm moving to Bangalore next year, the role is already confirmed.\"", 0.9, "public"),
        ("career_ambition", "Wants to lead an engineering team within 3 years.",
         "\"I want to be managing a team by 31.\"", 0.8, "agent_only"),
        ("lifestyle", "Early riser, plays football on weekends.",
         "\"Sunday mornings are football, non-negotiable.\"", 0.85, "public"),
        ("finances", "Supports parents financially; saving for a flat.",
         "\"I send money home every month and I'm saving for a down payment.\"", 0.8, "private"),
        ("dealbreakers", "Will not consider a partner who smokes.",
         "\"Smoking is a hard no for me.\"", 0.95, "agent_only"),
        ("partner_expectations", "Hopes partner is open to living with his parents for the first year.",
         "\"Ideally for the first year we'd stay with my parents.\"", 0.7, "agent_only"),
    ]
    return [m.Aspect(id=f"a{i}", category=c, statement=s, evidence=e, confidence=conf,
                     visibility=v, created_at=NOW) for i, (c, s, e, conf, v) in enumerate(rows, 1)]


def intake_messages() -> list[m.IntakeMessage]:
    return [
        m.IntakeMessage(id="i1", role="agent", created_at=NOW, text=(
            "Namaste! I'm Jodi, your AI matchmaker. Think of me as the family friend who does "
            "the legwork — I'll get to know you, scout quietly, and only bring you one person "
            "at a time. To start, tell me a little about your day-to-day?")),
        m.IntakeMessage(id="i2", role="user", created_at=NOW, text=(
            "I'm a software engineer in Kolkata, living with my parents and dadi. Moving to "
            "Bangalore next year.")),
        m.IntakeMessage(id="i3", role="agent", created_at=NOW, text=(
            "Bangalore — exciting! Since you'll be moving, would you want a partner who's "
            "already there, or someone open to relocating with you?")),
    ]


def intake_reply() -> m.IntakeMessageResponse:
    return m.IntakeMessageResponse(
        reply="That helps a lot. How do you usually spend your weekends?",
        completeness=0.45,
        missing_categories=["faith_practice", "finances", "communication_style"],
        new_aspects=aspects()[:2],
    )


def learning_log() -> list[m.LearningEntry]:
    return [m.LearningEntry(
        id="l1", match_id="m_prev", decision="pass", reason="family",
        old_weights=m.PreferenceWeights(), new_weights=user().preference_weights,
        explanation="You weighted family closeness higher than you told me. I've moved 2 candidates up.",
        created_at=NOW)]


def candidate(user_id: str = MEERA) -> m.CandidateSummary:
    if user_id == ARJUN:
        return m.CandidateSummary(user_id=ARJUN, display_name="Arjun M.", age=28,
                                  city="Kolkata", profession="Software Engineer")
    return m.CandidateSummary(user_id=MEERA, display_name="Meera S.", age=27, city="Bangalore",
                              profession="Product Designer", is_new=True)


def scores(overall: float = 88) -> m.Scores:
    return m.Scores(
        overall=overall, values=90, family_fit=84, lifestyle=86, career=88, location=95,
        communication=82,
        reasons={
            "values": "Both put family first while valuing independence.",
            "family_fit": "She's close to her parents; open to a joint-family start, with limits.",
            "lifestyle": "Both active weekend people; she hikes, he plays football.",
            "career": "Two ambitious careers in tech with mutual respect.",
            "location": "She's in Bangalore; he's moving there next year.",
            "communication": "Both prefer talking things through directly.",
        },
    )


def pipeline() -> m.PipelineResponse:
    others = [
        ("m2", "Priya R.", 26, "Pune", "Chartered Accountant", 79, "queued"),
        ("m3", "Ananya K.", 27, "Bangalore", "Data Scientist", 76, "queued"),
        ("m4", "Riya D.", 25, "Kolkata", "Doctor", 71, "screening"),
    ]
    items = [m.PipelineItem(match_id=MATCH, candidate=candidate(), scores=scores(), status="briefed")]
    for mid, name, age, city, prof, ov, st in others:
        items.append(m.PipelineItem(
            match_id=mid, status=st, scores=scores(ov),
            candidate=m.CandidateSummary(user_id=mid, display_name=name, age=age, city=city,
                                         profession=prof)))
    return m.PipelineResponse(count=len(items), items=items)


def match(status: str = "briefed") -> m.Match:
    return m.Match(id=MATCH, user_a=ARJUN, user_b=MEERA, status=status, scores=scores(),
                   briefed_at=NOW, created_at=NOW)


def interview() -> m.InterviewResponse:
    a, b = "Arjun's matchmaker", "Meera's matchmaker"
    rows = [
        (1, "agent_a", a, "Namaste! I'm the AI matchmaker for Arjun. He lives with his parents and grandmother in Kolkata — a close, warm household. Could you tell me about Meera's family?", None),
        (1, "agent_b", b, "Of course. Meera's parents are in Kolkata too, and she moved to Bangalore for work. She's very close to them and calls home daily.", "green"),
        (1, "agent_a", a, "Arjun's family hopes the couple might live with them for the first year. How would Meera feel about that?", None),
        (1, "agent_b", b, "She's open to it for a short period, but would want a clear plan for their own home after that.", "yellow"),
        (2, "agent_a", a, "What does a typical weekday look like for Meera?", None),
        (2, "agent_b", b, "Early start, studio by 9, and she guards her evenings for sketching and long walks.", None),
        (2, "agent_b", b, "How does Arjun handle disagreements?", None),
        (2, "agent_a", a, "He likes to cool off briefly, then talk it through the same day. He doesn't let things simmer.", "green"),
        (3, "agent_a", a, "Any dealbreakers on your side? Arjun's is smoking.", None),
        (3, "agent_b", b, "Meera doesn't smoke. Hers is a partner who expects her to give up her career — sounds like no conflict.", "green"),
        (3, "agent_a", a, "My recommendation: a strong match worth a Focus Week.", None),
        (3, "agent_b", b, "Agreed — recommend.", None),
    ]
    turns = [m.InterviewTurn(id=f"t{i}", round=r, speaker=s, speaker_name=n, text=t, highlight=h,
                             turn_index=i) for i, (r, s, n, t, h) in enumerate(rows)]
    return m.InterviewResponse(status="done", turns=turns, round_summaries=[
        "Both families are close-knit; living arrangement needs discussion.",
        "Compatible routines; both resolve conflict directly.",
        "No dealbreakers. Both matchmakers recommend.",
    ])


def brief(for_user_id: str = ARJUN) -> m.Brief:
    other = MEERA if for_user_id == ARJUN else ARJUN
    s = scores()
    return m.Brief(
        match_id=MATCH, for_user_id=for_user_id, candidate=candidate(other), compatibility=s.overall,
        snapshot=("Meera is a 27-year-old product designer in Bangalore, originally from Kolkata. "
                  "She's close to her family, guards her creative time, and is looking for someone "
                  "steady who backs her career."),
        why_fit=[m.WhyFitItem(dimension=d, score=getattr(s, d), reason=s.reasons[d])
                 for d in ["values", "family_fit", "lifestyle", "career", "location", "communication"]],
        green_flags=[
            m.FlagItem(text="Calls her parents every day", evidence="\"She's very close to them and calls home daily.\""),
            m.FlagItem(text="No dealbreaker conflicts", evidence="\"Meera doesn't smoke.\""),
            m.FlagItem(text="Already in Bangalore", evidence="\"She moved to Bangalore for work.\""),
        ],
        explore=[m.FlagItem(text="Living with your parents in year one",
                            evidence="\"Open to it for a short period, but would want a clear plan.\"")],
        questions_only_you=[
            "What would 'our own home' look like after the first year?",
            "How do you each like to spend a free Sunday?",
            "How would you split time between both families during festivals?",
        ],
        family_fit=("Meera's family is from Kolkata and shares similar traditions. She is warm towards "
                    "elders and open to a joint-family start, with a plan to move out after a year."),
        generated_at=NOW,
    )


def learning_result() -> m.LearningResult:
    return m.LearningResult(
        old_weights=m.PreferenceWeights(), new_weights=user().preference_weights,
        explanation="You weighted family closeness higher than you told me. I've moved 2 candidates up.",
        moved_up=2)


def focus_state(user_id: str = ARJUN) -> m.FocusState:
    return m.FocusState(
        match_id=MATCH, day=2, total_days=7, status="focus_week", ends_at=NOW + timedelta(days=5),
        partner=candidate(MEERA if user_id == ARJUN else ARJUN),
        deck_today=["What does a normal workday look like for you?",
                    "How involved are your parents in day-to-day decisions?",
                    "What's one thing about your routine you'd never give up?"])


def chat() -> list[m.ChatMessage]:
    return [
        m.ChatMessage(id="c1", sender_id=ARJUN, text="Hi Meera! My matchmaker says you sketch in the evenings?", created_at=NOW),
        m.ChatMessage(id="c2", sender_id=MEERA, text="Guilty 😄 And yours says you never miss Sunday football.", created_at=NOW),
    ]


def personas() -> list[m.Persona]:
    return [
        m.Persona(user_id=ARJUN, name="Arjun Mehta", role="candidate", tagline="28 · Software Engineer · Kolkata → Bangalore"),
        m.Persona(user_id=MEERA, name="Meera Sen", role="candidate", tagline="27 · Product Designer · Bangalore"),
        m.Persona(user_id=ARJUN_PARENT, name="Sunita Mehta", role="parent", tagline="Arjun's mother"),
    ]
