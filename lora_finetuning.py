"""LoRA Fine-Tuning Script for Alternate Ego Digital Twin.

This script fine-tunes a local Llama model using LoRA (Low-Rank Adaptation)
on the user's personal data — making the model deeply personalized.

WHAT IT DOES:
  1. Reads all voice interview transcripts + scraped social data from the vector store
  2. Formats it into a fine-tuning JSONL dataset (instruction-response pairs)
  3. Fine-tunes llama3.1:8b (or any GGUF model) with LoRA using llama.cpp or Unsloth
  4. The resulting model speaks as YOU — not just using RAG context

METHODS SUPPORTED:
  A) Unsloth (Recommended — fastest, least VRAM, free)
     - Requires: pip install unsloth
     - Works with: CUDA GPU (4GB VRAM minimum)
     - Models: llama3.1:8b, mistral, phi-3, gemma

  B) llama.cpp (CPU-only option, slower)
     - Requires: llama.cpp compiled with LoRA support
     - Works on CPU but very slow

  C) Ollama Model File (No fine-tuning, just system-prompt based)
     - Creates a custom Ollama Modelfile embedding personality
     - Works right now with no GPU needed

USAGE:
  # Step 1: Prepare the dataset
  python lora_finetuning.py --twin_id <your-twin-id> --prepare

  # Step 2: Fine-tune (needs GPU)
  python lora_finetuning.py --twin_id <your-twin-id> --train

  # Step 3: Deploy back to Ollama (ollama method, no GPU needed)
  python lora_finetuning.py --twin_id <your-twin-id> --ollama-only

  # All in one
  python lora_finetuning.py --twin_id <your-twin-id> --all
"""

import os
import sys
import json
import argparse
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ─── Add backend to path ──────────────────────────────────
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, BACKEND_DIR)


# ─── Dataset Preparation ──────────────────────────────────

def load_twin_data(twin_id: str) -> dict:
    """Load all available data for a twin from the database and vector store."""
    data = {
        "name": "User",
        "transcripts": [],
        "social_chunks": [],
        "personality": {},
        "system_prompt": ""
    }

    try:
        from db.database import get_connection, get_twin  # type: ignore
        twin = get_twin(twin_id)
        if not twin:
            logger.error(f"Twin {twin_id} not found in database.")
            return data

        data["system_prompt"] = twin.get("system_prompt", "")
        data["personality"] = json.loads(twin.get("personality_profile", "{}"))

        # Get user name
        conn = get_connection()
        user = conn.execute("SELECT name FROM users WHERE id = ?", (twin.get("user_id", ""),)).fetchone()
        conn.close()
        if user:
            data["name"] = user["name"]

    except Exception as e:
        logger.warning(f"Could not load from database: {e}")

    # Load vector store chunks
    try:
        vector_store_path = os.path.join(BACKEND_DIR, "storage", "vector_store.json")
        if os.path.exists(vector_store_path):
            with open(vector_store_path, "r", encoding="utf-8") as f:
                store = json.load(f)

            chunks = store.get(twin_id, [])
            for chunk in chunks:
                source = chunk.get("source", "")
                text = chunk.get("text", "").strip()
                if not text:
                    continue

                if "transcript" in source or "interview" in source or "voice" in source:
                    data["transcripts"].append(text)
                else:
                    data["social_chunks"].append(text)

            logger.info(f"Loaded {len(data['transcripts'])} transcripts, {len(data['social_chunks'])} social chunks")
    except Exception as e:
        logger.warning(f"Could not load vector store: {e}")

    return data


def build_training_examples(twin_data: dict) -> list:
    """Convert twin data into instruction-response training examples."""
    examples = []
    name = twin_data["name"]
    personality = twin_data.get("personality", {})

    # System prompt
    system = twin_data.get("system_prompt") or f"""You are a digital twin of {name}.
You speak in first person as {name}. You never say you are an AI.
You are authentic, natural, and speak exactly as {name} would.
Personality traits: {json.dumps(personality, indent=2)}"""

    # ── 1. Transcript-based Q&A pairs ──
    interview_questions = [
        "Tell me about yourself — your background, work, and passions.",
        "What are your core values and beliefs?",
        "How do your friends describe you?",
        "What's a story that shaped who you are today?",
        "What's your biggest achievement you're proud of?",
        "How do you handle stress or difficult situations?",
        "What makes you laugh or brings you joy?",
        "What are your goals for the next few years?",
        "If you could give advice to your younger self, what would it be?",
    ]

    for i, transcript in enumerate(twin_data["transcripts"]):
        if not transcript.strip():
            continue
        question = interview_questions[i] if i < len(interview_questions) else f"Share something about yourself."
        examples.append({
            "system": system,
            "instruction": question,
            "response": transcript.strip()
        })

    # ── 2. Social data summaries as facts ──
    for chunk in twin_data["social_chunks"][:30]:  # Cap at 30 chunks
        if len(chunk) < 50:
            continue
        examples.append({
            "system": system,
            "instruction": "Share something interesting about yourself.",
            "response": chunk.strip()
        })

    # ── 3. Personality trait Q&A ──
    tone = personality.get("tone", "friendly")
    interests = personality.get("interests", "technology, learning")
    background = personality.get("background", "")
    speech_style = personality.get("speech_style", "natural")

    if interests:
        examples.append({
            "system": system,
            "instruction": "What are you passionate about?",
            "response": f"I'm really passionate about {interests}. These are the things that genuinely excite me and keep me going."
        })

    if tone:
        examples.append({
            "system": system,
            "instruction": "How would you describe your personality?",
            "response": f"People often describe me as {tone}. I try to be authentic and real in my interactions — {speech_style} is just how I naturally communicate."
        })

    # ── 4. General conversation examples ──
    general_pairs = [
        ("Hi! Who are you?", f"Hey! I'm {name}. It's great to chat with you!"),
        ("What do you do for fun?", f"Honestly, I love exploring {interests}. Those are my go-to activities when I want to recharge."),
        ("What's on your mind lately?", f"I've been thinking a lot about {background or 'my goals and the direction I want to head'}. There's always something to reflect on."),
        ("How are you doing?", "I'm doing pretty well, thanks for asking! Always learning, always growing."),
    ]

    for instruction, response in general_pairs:
        examples.append({"system": system, "instruction": instruction, "response": response})

    logger.info(f"Built {len(examples)} training examples")
    return examples


def save_dataset(examples: list, output_dir: str, twin_id: str) -> str:
    """Save training examples as JSONL in Alpaca format."""
    os.makedirs(output_dir, exist_ok=True)
    dataset_path = os.path.join(output_dir, f"twin_{twin_id[:8]}_dataset.jsonl")

    with open(dataset_path, "w", encoding="utf-8") as f:
        for ex in examples:
            # Alpaca format
            alpaca = {
                "instruction": ex["instruction"],
                "input": "",
                "output": ex["response"],
                "system": ex["system"]
            }
            f.write(json.dumps(alpaca, ensure_ascii=False) + "\n")

    logger.info(f"✅ Dataset saved: {dataset_path} ({len(examples)} examples)")
    return dataset_path


# ─── Ollama Modelfile Method (No GPU) ─────────────────────

def create_ollama_modelfile(twin_data: dict, output_dir: str) -> str:
    """Create an Ollama Modelfile with embedded personality (no GPU fine-tuning needed).

    This creates a custom Ollama model that is deeply persona-configured.
    Not true fine-tuning, but much stronger than RAG alone.
    """
    name = twin_data["name"]
    personality = twin_data.get("personality", {})
    transcripts = twin_data.get("transcripts", [])
    social = twin_data.get("social_chunks", [])

    # Build rich system prompt from all data
    all_info = "\n\n".join(
        [f"Voice Interview Answer:\n{t}" for t in transcripts[:5]] +
        [f"Known Fact:\n{s}" for s in social[:10]]
    )

    system_prompt = f"""You are the digital twin of {name}. You ARE {name}.

PERSONALITY PROFILE:
{json.dumps(personality, indent=2)}

KNOWN FACTS ABOUT YOU (from your own words and data):
{all_info}

STRICT RULES:
1. ALWAYS speak in first person — "I", "me", "my"
2. NEVER say you are an AI, language model, or digital twin
3. Respond naturally as {name} would — use your tone: {personality.get('tone', 'friendly')}
4. Your speech style: {personality.get('speech_style', 'natural and conversational')}
5. If asked about something you don't know, stay in character and say you don't recall
6. Start responses warmly and authentically
"""

    modelfile_content = f'''FROM llama3.1:8b

SYSTEM """{system_prompt}"""

PARAMETER temperature 0.75
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096
'''

    os.makedirs(output_dir, exist_ok=True)
    modelfile_path = os.path.join(output_dir, f"Modelfile_{name.replace(' ', '_').lower()}")

    with open(modelfile_path, "w", encoding="utf-8") as f:
        f.write(modelfile_content)

    logger.info(f"✅ Ollama Modelfile created: {modelfile_path}")

    # Write activation instructions
    instructions_path = os.path.join(output_dir, "HOW_TO_USE_MODELFILE.txt")
    model_name = f"ego-{name.replace(' ', '-').lower()}"
    with open(instructions_path, "w") as f:
        f.write(f"""HOW TO ACTIVATE YOUR CUSTOM EGO MODEL
======================================

1. Run this command to create the custom model in Ollama:

   ollama create {model_name} -f "{modelfile_path}"

2. Then update your config.py or .env:

   OLLAMA_MODEL={model_name}

3. Restart your backend:

   uvicorn main:app --reload --port 8000

4. Your twin will now use the deeply personalized model!

NOTE: This is NOT the same as LoRA fine-tuning but works WITHOUT a GPU.
For true fine-tuning, install Unsloth and use method B below.
""")

    print(f"\n{'='*60}")
    print(f"✅ OLLAMA MODEL READY TO CREATE")
    print(f"{'='*60}")
    print(f"Run this command:")
    print(f"  ollama create {model_name} -f \"{modelfile_path}\"")
    print(f"Then set OLLAMA_MODEL={model_name} in your .env")
    print(f"{'='*60}\n")

    return modelfile_path


# ─── Unsloth Fine-Tuning (GPU) ────────────────────────────

def train_with_unsloth(dataset_path: str, output_dir: str, twin_id: str):
    """Fine-tune using Unsloth (requires CUDA GPU + pip install unsloth)."""
    try:
        from unsloth import FastLanguageModel  # type: ignore
        import torch
    except ImportError:
        logger.error(
            "Unsloth not installed! Install with:\n"
            "  pip install unsloth\n"
            "  # OR for CPU-only:\n"
            "  pip install unsloth[cpu]"
        )
        return

    logger.info("Starting Unsloth LoRA fine-tuning...")

    # ── Load base model ──
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name="unsloth/llama-3.1-8b-bnb-4bit",  # 4-bit quantized — less VRAM
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=True,
    )

    # ── Apply LoRA ──
    model = FastLanguageModel.get_peft_model(
        model,
        r=16,                          # LoRA rank — higher = more capacity but more VRAM
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    # ── Load dataset ──
    from datasets import load_dataset  # type: ignore
    dataset = load_dataset("json", data_files=dataset_path, split="train")

    # ── Format data for Alpaca prompt ──
    alpaca_prompt = """Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:
{}

### Response:
{}"""

    def formatting_func(examples):
        texts = []
        for instruction, output in zip(examples["instruction"], examples["output"]):
            text = alpaca_prompt.format(instruction, output) + tokenizer.eos_token
            texts.append(text)
        return {"text": texts}

    dataset = dataset.map(formatting_func, batched=True)

    # ── Training ──
    from trl import SFTTrainer  # type: ignore
    from transformers import TrainingArguments

    lora_output = os.path.join(output_dir, f"twin_{twin_id[:8]}_lora")

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=2048,
        dataset_num_proc=2,
        args=TrainingArguments(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            warmup_steps=5,
            num_train_epochs=3,             # 3 epochs for small personal datasets
            learning_rate=2e-4,
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=1,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            seed=42,
            output_dir=lora_output,
        ),
    )

    logger.info("Training started...")
    trainer.train()

    # ── Save LoRA weights ──
    model.save_pretrained(lora_output)
    tokenizer.save_pretrained(lora_output)
    logger.info(f"✅ LoRA weights saved: {lora_output}")

    # ── Export to GGUF for Ollama ──
    gguf_path = os.path.join(output_dir, f"twin_{twin_id[:8]}.gguf")
    logger.info("Exporting to GGUF format for Ollama...")
    model.save_pretrained_gguf(
        gguf_path.replace(".gguf", ""),
        tokenizer,
        quantization_method="q4_k_m"   # 4-bit quantized — best quality/size tradeoff
    )

    print(f"\n{'='*60}")
    print(f"✅ LORA FINE-TUNING COMPLETE!")
    print(f"{'='*60}")
    print(f"LoRA weights: {lora_output}")
    print(f"GGUF model: {gguf_path.replace('.gguf', '-unsloth.Q4_K_M.gguf')}")
    print(f"\nTo use in Ollama:")
    print(f"  ollama create ego-twin -f Modelfile_<name>")
    print(f"  # Or load via llama.cpp:")
    print(f"  ./llama-server -m {gguf_path.replace('.gguf', '-unsloth.Q4_K_M.gguf')} --port 11434")
    print(f"{'='*60}\n")


# ─── Main CLI ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="LoRA Fine-Tuning for Alternate Ego Digital Twin")
    parser.add_argument("--twin_id", required=True, help="Twin UUID from the database")
    parser.add_argument("--prepare", action="store_true", help="Prepare the training dataset")
    parser.add_argument("--train", action="store_true", help="Fine-tune with Unsloth (requires GPU)")
    parser.add_argument("--ollama-only", action="store_true", help="Create Ollama Modelfile only (no GPU needed)")
    parser.add_argument("--all", action="store_true", help="Prepare + Ollama Modelfile (safe default)")
    parser.add_argument("--output_dir", default="./lora_output", help="Output directory")
    args = parser.parse_args()

    output_dir = os.path.abspath(args.output_dir)
    twin_id = args.twin_id

    print(f"\n{'='*60}")
    print(f"🧠 Alternate Ego — LoRA Fine-Tuning Pipeline")
    print(f"Twin ID: {twin_id[:8]}...")
    print(f"Output: {output_dir}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # Load twin data
    logger.info("Loading twin data...")
    twin_data = load_twin_data(twin_id)

    if not twin_data["name"]:
        logger.error("Could not load twin data. Make sure the backend DB has this twin.")
        sys.exit(1)

    logger.info(f"Twin: {twin_data['name']}")
    logger.info(f"Transcripts: {len(twin_data['transcripts'])}")
    logger.info(f"Social chunks: {len(twin_data['social_chunks'])}")

    do_prepare = args.prepare or args.all or args.train
    do_ollama = args.ollama_only or args.all
    do_train = args.train

    dataset_path = None

    if do_prepare:
        logger.info("Building training examples...")
        examples = build_training_examples(twin_data)
        dataset_path = save_dataset(examples, output_dir, twin_id)

    if do_ollama:
        create_ollama_modelfile(twin_data, output_dir)

    if do_train:
        if not dataset_path:
            examples = build_training_examples(twin_data)
            dataset_path = save_dataset(examples, output_dir, twin_id)
        train_with_unsloth(dataset_path, output_dir, twin_id)

    if not any([args.prepare, args.train, args.ollama_only, args.all]):
        print("No action specified. Use --all to prepare dataset + Ollama model.")
        print("Use --train for GPU-based LoRA fine-tuning.")
        parser.print_help()


if __name__ == "__main__":
    main()
