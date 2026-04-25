"""Voice transcript processor — converts interview answers into RAG-ready chunks.

Contains 100 personality-probing questions organized by category.
During onboarding, 10 are randomly selected for the voice interview.
Each answer is capped at 2 minutes of speaking time.
"""
import random
from typing import List, Dict
from rag.chunker import chunk_voice_answers, chunk_by_topic
from rag.vector_store import add_chunks
import logging

logger = logging.getLogger(__name__)

# ── 100 PERSONALITY-PROBING INTERVIEW QUESTIONS ──────────────────
# Designed for: max 2 min voice answer, natural speech for cloning,
# deep personality extraction for digital twin accuracy.

QUESTION_BANK = {
    # ── IDENTITY & BACKGROUND (15 questions) ──
    "identity": [
        "Tell me about yourself — your background, what you do, and what drives you.",
        "Where did you grow up, and how did that shape who you are today?",
        "What's your current profession, and how did you end up doing it?",
        "Describe your typical day from morning to night.",
        "If someone were to write your biography, what would the opening line be?",
        "What's the one thing people always get wrong about you?",
        "How would you introduce yourself to a stranger at a party?",
        "What's the most interesting thing about your family or upbringing?",
        "Describe your educational journey — what did you study and why?",
        "What role does your culture or heritage play in your daily life?",
        "What nickname do people call you, and how did you get it?",
        "If you could live anywhere in the world, where would it be and why?",
        "What languages do you speak, and which one feels most like home?",
        "What's the biggest risk you've ever taken in your career?",
        "Describe yourself in exactly five words.",
    ],

    # ── VALUES & BELIEFS (12 questions) ──
    "values": [
        "What are the three values you refuse to compromise on?",
        "What's a belief you hold that most people would disagree with?",
        "What does success mean to you — not the dictionary definition, YOUR definition?",
        "What kind of injustice makes your blood boil?",
        "What's more important to you: being respected or being liked?",
        "What's a rule you always follow, no matter what?",
        "What do you think is the purpose of life?",
        "How do you decide what's right when there's no clear answer?",
        "What would you fight for, even if you knew you'd lose?",
        "What's a tradition or ritual that's sacred to you?",
        "Do you believe people can truly change? Why or why not?",
        "What's something society celebrates that you think is overrated?",
    ],

    # ── PERSONALITY & TRAITS (13 questions) ──
    "personality": [
        "How would your closest friend describe your personality in one sentence?",
        "Are you more of a thinker or a feeler? Give me an example.",
        "What's your biggest strength, and how does it show up in your daily life?",
        "What's a weakness you're actively working on?",
        "Are you an introvert, extrovert, or ambivert? How does that affect you?",
        "What kind of humor do you have? Tell me something that makes you laugh hard.",
        "How do you act when you're nervous or uncomfortable?",
        "What's your energy like in a group versus when you're alone?",
        "How do you handle criticism — honestly?",
        "What's a habit you have that you wish you could break?",
        "Are you more of a planner or a spontaneous person?",
        "What's the weirdest thing about you that you actually love?",
        "How competitive are you, on a scale of 1 to 10?",
    ],

    # ── EMOTIONS & RELATIONSHIPS (12 questions) ──
    "emotions": [
        "What makes you genuinely happy — not just smile, but deeply happy?",
        "What's the last thing that made you cry, and why?",
        "How do you express love or care to the people closest to you?",
        "What does a perfect friendship look like to you?",
        "What's the most important lesson a relationship taught you?",
        "How do you deal with loneliness or feeling left out?",
        "What kind of people do you naturally gravitate toward?",
        "What's a compliment someone gave you that you'll never forget?",
        "How do you handle anger — do you explode, go silent, or something else?",
        "What's the kindest thing anyone has ever done for you?",
        "Describe a moment where you felt completely at peace.",
        "What scares you the most about the future?",
    ],

    # ── PASSIONS & INTERESTS (12 questions) ──
    "passions": [
        "What are you so passionate about that you could talk about it for hours?",
        "What's a hobby or skill you've been obsessing over lately?",
        "What type of music are you into, and what does it say about you?",
        "What's the best movie, book, or show you've experienced recently?",
        "If you had a full day with zero responsibilities, how would you spend it?",
        "What's something you're surprisingly good at that people don't expect?",
        "What sport, game, or activity gets you in the zone?",
        "What's on your bucket list that you haven't done yet?",
        "What's a topic you've gone down a rabbit hole on?",
        "What kind of food represents your personality and why?",
        "Who is someone — living or dead — you'd love to have dinner with?",
        "What's a skill you want to learn in the next year?",
    ],

    # ── STORIES & EXPERIENCES (12 questions) ──
    "stories": [
        "Tell me about a moment that completely changed the direction of your life.",
        "What's your favorite memory from childhood?",
        "Describe the hardest thing you've ever been through and how you survived it.",
        "What's the funniest thing that's ever happened to you?",
        "Tell me about a time you failed badly — and what you learned from it.",
        "What's an adventure or trip that left a lasting impact on you?",
        "Describe a time when you stood up for something or someone.",
        "What's a random encounter with a stranger that you still think about?",
        "Tell me about a decision you almost didn't make but you're glad you did.",
        "What's the most embarrassing moment you can laugh about now?",
        "Describe a moment where you surprised yourself with your own courage.",
        "What's the best advice someone gave you, and did you follow it?",
    ],

    # ── COMMUNICATION STYLE (12 questions) ──
    "communication": [
        "How do you explain complicated things to people? Give me an example.",
        "What's a phrase or word you use all the time without realizing it?",
        "Are you the type to send voice notes or text messages? Why?",
        "How do you argue — with logic, emotion, or humor?",
        "What's your go-to response when someone asks 'how are you?'",
        "Do you think before you speak, or speak while thinking?",
        "How do you comfort someone who's going through a tough time?",
        "What's your texting style — short and sweet, or essay-length?",
        "How sarcastic are you in real life?",
        "What's a topic that instantly makes you passionate when you talk about it?",
        "How do you react when you disagree with someone's opinion?",
        "If your speaking style had a vibe, what would it be?",
    ],

    # ── GOALS & FUTURE (12 questions) ──
    "goals": [
        "Where do you see yourself in 5 years — be specific.",
        "What legacy do you want to leave behind?",
        "What's a dream you've been chasing but haven't achieved yet?",
        "If money wasn't a problem, what would you do with your life?",
        "What's the one thing you want to be remembered for?",
        "What advice would you give to your younger self?",
        "What's a goal you achieved that felt impossible at first?",
        "If you could master one thing overnight, what would it be?",
        "What does your ideal life look like 10 years from now?",
        "What's something you're working on right now that excites you?",
        "If you could solve one problem in the world, what would it be?",
        "What's the next big chapter in your life story?",
    ],
}

# Flatten all questions into one list with category tags
ALL_QUESTIONS = []
for category, questions in QUESTION_BANK.items():
    for q in questions:
        ALL_QUESTIONS.append({"text": q, "category": category})

# Legacy list for backward compatibility
INTERVIEW_QUESTIONS = [q["text"] for q in ALL_QUESTIONS[:9]]


def get_random_questions(count: int = 5, seed: str = None) -> List[Dict]:
    """Select random questions ensuring category diversity.
    
    Picks at least 1 question from each category (8 categories),
    then fills remaining slots randomly.
    
    Args:
        count: Number of questions to select (default 10)
        seed: Optional seed for reproducibility (e.g., twin_id)
    
    Returns:
        List of {"index": int, "text": str, "category": str, "max_seconds": 120}
    """
    if seed:
        rng = random.Random(seed)
    else:
        rng = random.Random()
    
    selected = []
    categories = list(QUESTION_BANK.keys())
    
    # Phase 1: Pick 1 from each category (8 questions)
    for cat in categories:
        q = rng.choice(QUESTION_BANK[cat])
        selected.append({"text": q, "category": cat})
    
    # Phase 2: Fill remaining slots from any category
    remaining = count - len(selected)
    if remaining > 0:
        pool = [q for q in ALL_QUESTIONS if q not in selected]
        extras = rng.sample(pool, min(remaining, len(pool)))
        selected.extend(extras)
    
    # Shuffle final list
    rng.shuffle(selected)
    
    # Add index and time limit
    result = []
    for i, q in enumerate(selected[:count]):
        result.append({
            "index": i,
            "text": q["text"],
            "category": q["category"],
            "max_seconds": 120  # 2 minutes per question
        })
    
    return result


def process_transcripts(twin_id: str, transcripts: List[Dict[str, str]]) -> Dict:
    """Process voice interview transcripts into RAG chunks.
    
    Args:
        twin_id: The twin's ID
        transcripts: List of {'question': str, 'answer': str}
    
    Returns:
        Processing result with chunk count
    """
    # Create Q&A chunks
    qa_chunks = chunk_voice_answers(transcripts)
    
    # Also create standalone answer chunks for broader matching
    standalone_chunks = []
    for t in transcripts:
        answer = t.get("answer", "").strip()
        if answer and len(answer) > 30:
            topic_chunks = chunk_by_topic(answer, "voice_transcript", "voice_interview")
            standalone_chunks.extend(topic_chunks)
    
    all_chunks = qa_chunks + standalone_chunks
    
    if all_chunks:
        added = add_chunks(twin_id, all_chunks)
        logger.info(f"Processed {len(transcripts)} transcripts -> {added} chunks for twin {twin_id}")
        return {"chunks_added": added, "transcripts_processed": len(transcripts)}
    
    return {"chunks_added": 0, "transcripts_processed": 0}


def extract_personality_from_transcripts(transcripts: List[Dict[str, str]]) -> Dict:
    """Extract personality traits from voice transcripts using keyword analysis."""
    all_text = " ".join(t.get("answer", "") for t in transcripts).lower()
    
    personality = {
        "tone": "friendly and conversational",
        "interests": "",
        "background": "",
        "speech_style": "casual and natural",
        "values": "",
        "stories": ""
    }
    
    # Extract interests (things mentioned with passion/enthusiasm)
    interest_keywords = ['love', 'passionate', 'enjoy', 'fascinated', 'interested in',
                         'hobby', 'favorite', 'like to']
    interest_sentences = []
    for t in transcripts:
        answer = t.get("answer", "")
        sentences = answer.split('.')
        for s in sentences:
            if any(k in s.lower() for k in interest_keywords):
                interest_sentences.append(s.strip())
    if interest_sentences:
        personality["interests"] = "; ".join(interest_sentences[:5])
    
    # Extract background from first answer
    if transcripts and transcripts[0].get("answer"):
        personality["background"] = transcripts[0]["answer"][:300]
    
    # Extract values
    value_keywords = ['believe', 'value', 'important', 'principle', 'never compromise']
    value_sentences = []
    for t in transcripts:
        answer = t.get("answer", "")
        for s in answer.split('.'):
            if any(k in s.lower() for k in value_keywords):
                value_sentences.append(s.strip())
    if value_sentences:
        personality["values"] = "; ".join(value_sentences[:3])
    
    # Extract stories
    story_keywords = ['remember', 'once', 'happened', 'moment', 'experience', 'time when']
    story_sentences = []
    for t in transcripts:
        answer = t.get("answer", "")
        for s in answer.split('.'):
            if any(k in s.lower() for k in story_keywords):
                story_sentences.append(s.strip())
    if story_sentences:
        personality["stories"] = "; ".join(story_sentences[:3])
    
    return personality
