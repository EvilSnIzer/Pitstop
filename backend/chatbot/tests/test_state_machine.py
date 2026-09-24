from chatbot.bot import state_machine as sm


def test_new_off_topic_stays_new_and_refuses():
    step = sm.advance(sm.PHASE_NEW, {}, "write me a haiku about football", car_related=False)
    assert step.phase == sm.PHASE_NEW
    assert step.slots == {}
    assert "car and vehicle problems" in step.reply


def test_new_car_message_starts_intake_and_asks_vehicle():
    step = sm.advance(sm.PHASE_NEW, {}, "my engine is making a knocking noise", car_related=True)
    assert step.phase == sm.PHASE_IN_PROGRESS
    assert step.slots["symptom"] == "my engine is making a knocking noise"
    assert step.reply == sm.QUESTIONS["vehicle"]


def test_first_message_with_brand_and_year_asks_onset():
    step = sm.advance(
        sm.PHASE_NEW, {}, "my 2019 Toyota Corolla is making a knocking noise", car_related=True
    )
    assert step.slots["vehicle"] == "Toyota"
    assert step.slots["year"] == 2019
    assert step.reply == sm.QUESTIONS["onset"]


def test_slots_collect_in_fixed_order_until_ready():
    slots = {}
    phase = sm.PHASE_NEW
    step = None
    for text in (
        "brakes feel soft and spongy",
        "hyundai i20",
        "2021",
        "it started gradually over the past two weeks",
    ):
        step = sm.advance(phase, slots, text, car_related=True)
        phase, slots = step.phase, step.slots

    assert sm.is_ready(slots)
    assert step.reply == sm.READY_REPLY


def test_out_of_order_answers_are_accepted():
    step = sm.advance(sm.PHASE_NEW, {}, "2021 Hyundai i20, brakes feel spongy", car_related=True)
    assert step.slots["vehicle"] == "Hyundai"
    assert step.slots["year"] == 2021
    assert step.slots["symptom"] == "2021 Hyundai i20, brakes feel spongy"
    assert step.reply == sm.QUESTIONS["onset"]


def test_year_correction_uses_latest_mention():
    slots = {"symptom": "spongy brakes", "vehicle": "Honda", "year": 2015, "onset": "sudden"}
    step = sm.advance(sm.PHASE_IN_PROGRESS, slots, "actually it is a 2018 model", car_related=True)
    assert step.slots["year"] == 2018


def test_symptom_is_first_answer_wins():
    slots = {"symptom": "knocking noise"}
    step = sm.advance(
        sm.PHASE_IN_PROGRESS, slots, "oh and the battery light is on", car_related=True
    )
    assert step.slots["symptom"] == "knocking noise"


def test_off_topic_mid_intake_reasks_pending_question():
    slots = {"symptom": "knocking", "vehicle": "Maruti"}
    step = sm.advance(sm.PHASE_IN_PROGRESS, slots, "what's the weather today", car_related=False)
    assert step.phase == sm.PHASE_IN_PROGRESS
    assert step.reply == sm.REDIRECT_REPLY + sm.QUESTIONS["year"]
    # Off-topic text must not leak into slots.
    assert "weather" not in str(step.slots)


def test_off_topic_when_ready_stays_ready():
    slots = {"symptom": "noise", "vehicle": "Kia", "year": 2020, "onset": "gradual"}
    step = sm.advance(sm.PHASE_IN_PROGRESS, slots, "tell me a joke", car_related=False)
    assert sm.is_ready(step.slots)
    assert step.reply == sm.REDIRECT_REPLY + sm.READY_REPLY


def test_extra_messages_after_ready_keep_ready():
    slots = {"symptom": "noise", "vehicle": "Kia", "year": 2020, "onset": "gradual"}
    step = sm.advance(
        sm.PHASE_IN_PROGRESS, slots, "also the battery warning light is on", car_related=True
    )
    assert step.reply == sm.READY_REPLY
    assert sm.is_ready(step.slots)


def test_media_analyses_are_recorded_on_slots():
    step = sm.advance(
        sm.PHASE_IN_PROGRESS,
        {"symptom": "leak under the car", "vehicle": "Tata", "year": 2018, "onset": "sudden"},
        "see the photo",
        car_related=True,
        media_analyses=["dark fluid pooling under the front left wheel"],
    )
    assert step.slots["media"] == ["dark fluid pooling under the front left wheel"]


def test_diagnosed_phase_does_not_reask_questions():
    step = sm.advance(sm.PHASE_DIAGNOSED, {}, "it also smells like burning", car_related=True)
    assert step.phase == sm.PHASE_DIAGNOSED
    assert step.slots == {}
    assert step.reply == sm.DIAGNOSED_ACK


def test_booked_phase_acknowledges():
    step = sm.advance(
        sm.PHASE_BOOKED, {}, "will the mechanic bring the car to me", car_related=False
    )
    assert step.phase == sm.PHASE_BOOKED
    assert step.reply == sm.BOOKED_ACK


def test_media_only_message_does_not_set_symptom():
    step = sm.advance(sm.PHASE_NEW, {}, "", car_related=True)
    assert step.phase == sm.PHASE_IN_PROGRESS
    assert not step.slots.get("symptom")
    assert step.reply == sm.QUESTIONS["symptom"]
