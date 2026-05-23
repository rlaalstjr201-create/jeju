#!/usr/bin/env python3
"""
HHEM-2.1-Open NLI entailment bridge.
Reads NDJSON from stdin, writes NDJSON to stdout.
Long-lived process: model loaded once on startup.

Input line:  {"premise": "...", "hypothesis": "..."}
Output line: {"score": 0.85, "label": "consistent"}

score >= 0.50 → factually consistent (not hallucination)
"""
import sys
import io
import json

# Windows: stdin/stdout may default to cp949 — force UTF-8
sys.stdin  = io.TextIOWrapper(sys.stdin.buffer,  encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def load_model():
    from transformers import AutoModelForSequenceClassification
    model = AutoModelForSequenceClassification.from_pretrained(
        "vectara/hallucination_evaluation_model",
        trust_remote_code=True,
    )
    # transformers 5.x breaks the T5 shared↔encoder.embed_tokens tie.
    # shared.weight loads fine from checkpoint; encoder.embed_tokens is a separate
    # zero-init tensor → logits ≈ 0 → sigmoid ≈ 0.5021 always.
    # Fix: re-point encoder.embed_tokens to shared.weight (restore original tie).
    import torch
    t5 = model.t5.transformer
    if hasattr(t5, 'shared') and hasattr(t5.encoder, 'embed_tokens'):
        if t5.encoder.embed_tokens.weight.data_ptr() != t5.shared.weight.data_ptr():
            t5.encoder.embed_tokens.weight = t5.shared.weight
            sys.stderr.write("[hhem] Restored encoder.embed_tokens → shared.weight tie\n")
    return model

def score_item(model, premise: str, hypothesis: str) -> dict:
    import torch
    scores = model.predict([(premise, hypothesis)])
    score = float(scores[0])
    return {"score": round(score, 4), "label": "consistent" if score >= 0.5 else "not_consistent"}

def main():
    sys.stderr.write("[hhem] Loading model...\n")
    sys.stderr.flush()
    model = load_model()
    sys.stderr.write("[hhem] Model ready. Waiting for input.\n")
    sys.stderr.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
            premise    = item.get("premise", "")
            hypothesis = item.get("hypothesis", "")
            result = score_item(model, premise, hypothesis)
        except Exception as e:
            result = {"score": 0.0, "label": "error", "error": str(e)}
        print(json.dumps(result, ensure_ascii=False))
        sys.stdout.flush()

if __name__ == "__main__":
    main()
