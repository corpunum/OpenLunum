"""LLMLingua-2 word pruner for guarded-codec stage 1 (CPU, local model files only).

stdin  JSONL {"id", "text", "lang": "en"|"el", "guard": bool}
stdout JSONL {"id", "view", "kept_words", "words"}

Per word, the keep probability is the mean of its tokens' "preserve" probability from the token classifier.
The top `--rate` share of words is kept (LLMLingua-2 style). The view is built from the ORIGINAL words, joined
by single spaces, so a kept word is byte-exact (no subword re-decoding that could garble paths or numbers).
With "guard", negation and modality words (the closed EN/EL lists of the pivot adapter) are always kept.
An empty view means the compressor proposes to omit the unit.
"""
import argparse
import json
import os
import re
import sys
import unicodedata

os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'
import torch  # noqa: E402
from transformers import AutoModelForTokenClassification, AutoTokenizer  # noqa: E402

DEFAULT_MODEL = os.path.expanduser('~/model-library/nlp/llmlingua-2-mbert')

# packages/eval/src/pivot-adapter.ts marker lists (folded: lowercase, no accents, final sigma as σ).
GUARD = {
    'en': {'not', 'no', 'never', 'nobody', 'nothing', 'none', 'neither', 'nor', 'nowhere', 'cannot', "n't",
           'must', "mustn't", 'ought', 'should', "shouldn't", "should've", 'have', 'has', 'had', 'having', 'need', 'needs',
           'needed', 'got', 'to', 'can', "can't", 'could', "couldn't", "could've", 'may', 'might', "mightn't",
           "might've", 'able', 'unable', 'maybe', 'perhaps', 'possibly', 'will', "won't", 'would', "wouldn't",
           "would've", 'shall', 'going', 'gonna', "'ll", "'d", 'one'},
    'el': {'δεν', 'δε', 'μην', 'μη', 'οχι', 'ουτε', 'πρεπει', 'επρεπε', 'ισωσ', 'πιθανον', 'πιθανωσ', 'ενδεχεται',
           'δυνατον', 'θα'},
}
EL_PREFIXES = ('μπορ',)
WORD = re.compile(r'\S+')


def fold(s):
    s = unicodedata.normalize('NFD', s).replace('’', "'").replace('‘', "'").lower().replace('ς', 'σ')
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')


def guarded(word, lang):
    w = fold(word).strip('.,;:!?()[]{}"«»')
    if w in GUARD.get(lang, GUARD['en']) or any(w.endswith(x) for x in ("n't", "'ll", "'d")):
        return True
    return lang == 'el' and w.startswith(EL_PREFIXES)


def word_probs(tok, model, text, words):
    """Mean preserve-probability per word; long texts in windows of 200 words."""
    probs = []
    for i in range(0, len(words), 200):
        chunk = words[i:i + 200]
        enc = tok([w.group() for w in chunk], is_split_into_words=True, return_tensors='pt', truncation=True, max_length=512)
        with torch.no_grad():
            p = model(**{k: v for k, v in enc.items() if k != 'offset_mapping'}).logits[0].softmax(-1)[:, 1].tolist()
        sums, counts = [0.0] * len(chunk), [0] * len(chunk)
        for t, wid in enumerate(enc.word_ids()):
            if wid is not None:
                sums[wid] += p[t]; counts[wid] += 1
        probs += [s / c if c else 0.0 for s, c in zip(sums, counts)]   # words cut by truncation get 0
    return probs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--rate', type=float, default=0.5)
    ap.add_argument('--model', default=DEFAULT_MODEL)
    args = ap.parse_args()
    torch.set_num_threads(max(1, os.cpu_count() // 2))
    tok = AutoTokenizer.from_pretrained(args.model, local_files_only=True)
    model = AutoModelForTokenClassification.from_pretrained(args.model, local_files_only=True).eval()
    for line in sys.stdin:
        row = json.loads(line)
        text, lang = row['text'], row.get('lang', 'en')
        words = list(WORD.finditer(text))
        if not words:
            print(json.dumps({'id': row['id'], 'view': '', 'kept_words': 0, 'words': 0}, ensure_ascii=False)); continue
        probs = word_probs(tok, model, text, words)
        n_keep = max(1, round(len(words) * args.rate))
        order = sorted(range(len(words)), key=lambda i: -probs[i])
        keep = set(order[:n_keep])
        if row.get('guard'):
            keep |= {i for i, w in enumerate(words) if guarded(w.group(), lang)}
        view = ' '.join(words[i].group() for i in sorted(keep))
        print(json.dumps({'id': row['id'], 'view': view, 'kept_words': len(keep), 'words': len(words)}, ensure_ascii=False))
        sys.stdout.flush()


if __name__ == '__main__':
    main()
