# Personal AI English Coach — PRD v1.0

## 1. Product definition
A private, adaptive, voice-first English coach for a B1–B2 Chinese-speaking professional working in automotive supply chain and international business. Primary objective: measurable improvement in business listening and speaking in 8–12 weeks, with 30 minutes/day.

### Success criteria
- 12-week adherence target: >= 60 of 84 daily sessions (not a guarantee of language outcomes).
- Comparable unseen listening assessments: >= 15 percentage-point improvement in key-information accuracy OR >= 80% by week 12, subject to baseline and test difficulty.
- Speaking: improvement in task completion and intelligibility as judged by a fixed rubric and blinded samples; track response latency and repeated errors separately.
- User-reported confidence and actual ability to complete role-play scenarios; no promise of CEFR-level advancement.

## 2. Learning methodology
Daily 30-minute cycle: 10m listening (blind listen, gist/detail check, replay), 12m voice role-play (task with goal, constraints and interruptions), 5m targeted correction (maximum 3 high-impact issues, re-speak), 3m spaced retrieval (old expressions in new contexts). Use 70% general international business and 30% automotive/supplier-specific scenarios. Maintain a 'do not interrupt' default during role-play; feedback follows the task.

## 3. Baseline assessment (20–25 min)
- Setup (1m): microphone check, consent, self-rating and preferred accent.
- Listening A (5m): 60–90s unseen business dialogue, one blind listen, 5 gist/detail questions; track first-pass accuracy.
- Listening B (4m): 60–90s unseen supplier update with varied accent, 4 questions; no transcript before answers.
- Speaking A (4m): 2m structured work introduction + follow-ups.
- Speaking B (6m): role-play a delayed supplier delivery: ask clarifying questions, explain impact, request recovery plan, agree next actions.
- Reflection (2m): confidence and perceived difficulty.
- Output: domain scores and uncertainty, strengths, top three weak points, recommended initial training plan. Do not claim standardized CEFR certification.

### Speaking rubric (each 0–4)
Task completion; intelligibility; fluency (pauses and restarts); lexical appropriateness; grammar/meaning accuracy; interaction (clarifying, responding, summarizing). Store examples and evidence; automated ratings are provisional.

## 4. Core user journeys
1. First launch -> mic permissions -> baseline -> personalized plan.
2. Daily session -> listening -> scenario conversation -> prioritized feedback -> re-speak -> spaced review -> completion summary.
3. Weekly review -> show actual examples, recurrent errors and completion trends -> adjust upcoming scenarios.
4. Biweekly assessment -> new, difficulty-matched test set -> compare with baseline using consistent rubric.

## 5. Functional requirements
### P0 (MVP)
- Profile, training goals and session timer.
- Audio capture, speech-to-text, text-to-speech; clear transcript provenance and correction ability.
- Structured scenario engine: role, goal, facts, complications, completion criteria.
- Feedback extraction with timestamps, original utterance, suggested correction, severity and confidence.
- Error memory with deduplication and retrieval practice scheduling.
- Listening player with first-pass answer capture, replay, transcript unlock after attempt.
- Baseline and biweekly test flows; immutable assessment snapshots and comparable test variants.
- Dashboard: attendance, listening accuracy, speaking task rubric, recurring errors; avoid single opaque proficiency score.
- Data export and deletion; opt-in audio retention, otherwise discard audio after processing.

### P1 (after MVP validation)
- Live low-latency full-duplex voice and interruption handling.
- Multiple English accents, meeting participants, adaptive difficulty.
- Import user-owned emails/documents after sensitive-data redaction.
- Native iOS app or enhanced PWA offline review.

## 6. Evaluation safeguards
- Keep test material unseen and separate from training; matched difficulty, rotated item bank.
- Compare first-pass listening results; no transcript until answer submission.
- Store original audio and ASR confidence where user opts in; avoid treating ASR errors as learner errors.
- Use a stable rubric, reference examples, and periodic human review where feasible.
- Show confidence intervals / small-sample caveats; don't overclaim progress.

## 7. Data model (conceptual)
UserProfile; TrainingPlan; Scenario; Session; Utterance; AudioAsset; FeedbackIssue; ErrorPattern; ReviewItem; ReviewAttempt; Assessment; AssessmentItem; AssessmentResponse; MetricSnapshot; ConsentRecord.

## 8. Suggested architecture (after learning design)
Next.js/TypeScript responsive PWA; API service; SQLite locally for single user initially (PostgreSQL when needed); model-provider adapters for LLM/STT/TTS; background scoring jobs; FSRS-like spaced-repetition scheduling; encrypted credentials and explicit retention settings. Prefer push-to-talk for initial MVP reliability; add real-time duplex voice later. Track API usage and per-session cost.

## 9. Four-week engineering plan (aspirational)
W1: domain model, onboarding, baseline prototype, scenario text engine.
W2: audio pipeline, listening player, voice role-play, transcript storage.
W3: feedback extraction, error patterns, spaced review, daily scheduling.
W4: assessment variants, analytics, privacy/export, pilot testing and fixes.

## 10. Acceptance tests
- New user can complete baseline and receive a plan.
- User can finish a 30-minute session and recover from audio/network errors.
- Feedback links to actual utterances and supports correction of false positives.
- A repeated mistake is resurfaced in a different context after delay.
- Assessments never leak answers/transcripts before submission.
- Progress comparison uses comparable, unseen items and labels uncertainty.
- User can export/delete learning records and control audio retention.

## 11. Open decisions
Preferred accent(s), platform priority (Mac/iPhone), acceptable recurring API cost, audio retention choice, and whether initial deployment is fully local or private cloud.
