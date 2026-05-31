# TaxBench-AU

## A benchmark for testing whether AI agents can calculate Australian tax

## The problem

AI tax agents are moving beyond demos and into client and compliance work. The useful test is narrow: can the model read the facts, choose the rule for the right income year, calculate the amount, and stop when one missing detail could change the result?

Tax practitioners already work this way. They check legislation, ATO guidance, thresholds, dates, and the exact wording of each scenario. Any model that drafts advice, answers client questions, or supports compliance work needs the same discipline. A polished paragraph does not help if the number is wrong.

Most broad AI benchmarks do not test calculation-heavy Australian tax work. A high score on a general exam does not show whether a model can apply the capital gains tax (CGT) discount, calculate fringe benefits tax (FBT), handle a study loan repayment, or notice the one fact that changes the answer.

TaxBench-AU tests that gap. It gives the agent a narrow task: answer Australian tax calculation questions that a verifier can recompute independently. Developers can use it while building tax tools. Compliance teams and independent evaluators can use it to test whether an agent is ready for calculation-heavy tax work.

The public dataset is available on Hugging Face as TaxBench-AU. Kaggle also hosts it as Agent Tax Exam for Australian Tax.

## What the dataset contains

The Kaggle set contains 156 Australian tax calculation questions. Each question has four answer options, A to D. The dataset balances the correct answers across the options: 39 answers are A, 39 are B, 39 are C, and 39 are D. The set includes 116 traditional calculation cases and 40 edge cases.

The questions cover CGT, rental property, depreciation, FBT, individual income tax and offsets, superannuation, Division 7A and franking, GST, study and training loans and income tests, and employment and termination payments. At the simple end, a question may require one arithmetic step. Harder questions require several steps and close attention to the income year, threshold, cap, or exception.

Each answer record gives reviewers what they need to audit the result:

- Question text: the scenario and options A to D, with the correct answer placed randomly.
- Income year: the year and legal references that govern the calculation, such as ITAA 1997 s 115-100, a section of the Income Tax Assessment Act 1997.
- Source URL: the original ATO page used to ground the example.
- Python verifier: a stored formula and named inputs that recompute the correct answer.

The dataset ships as three CSV files:

- question.csv: the id, topic, year, and question with options A to D.
- answer.csv: the correct option, value, worked explanation, Python verifier, legal references, and source URL.
- exam.csv: the question, answer, explanation, verifier, and metadata in one file.

By default, TaxBench-AU runs as a closed-book exam. The model sees only the question and answer options and returns one letter. The verifier then compares that letter with the stored answer key.

## A CGT example

The CGT example shows how the benchmark turns a tax rule into a diagnosable answer. The agent has to read the ownership period, apply the 50% CGT discount, and choose the final capital gain.

Justin, an Australian resident, buys a block of land. He owns it for 18 months and sells it, making a capital gain before discount of $10,000. He has no capital losses. What capital gain will Justin declare after applying the CGT discount?

A. $5,000. Correct: $10,000 halved by the 50% discount.

B. $10,000. Mistake: forgot to apply the discount.

C. $2,500. Mistake: applied the discount twice.

D. $20,000. Mistake: inverted the rate by dividing by 0.5.

The correct answer is A: $5,000. The wrong options are not random distractors. Each one points to a likely mistake. A wrong answer can therefore show whether the model forgot the discount, applied it twice, or used the rate backwards.

## Traditional and edge cases

All 156 public questions are synthetic. Each one changes the taxpayer name, the numbers, or both, so the answer from the original ATO example no longer works.

Traditional cases test the standard calculation. Each of the 116 traditional cases starts from a real ATO worked example. The dataset keeps the verified calculation and rewrites the scenario with a new taxpayer name, new numbers, or both. The 116 verbatim ATO originals stay out of the public set.

This limits answer recall. ATO examples are public and may appear in model training data. If the numbers stayed the same, a model could repeat the published answer instead of calculating. New numbers force a fresh calculation, although they do not hide the source from a determined agent with web search.

The 40 edge cases test whether the model notices the exception. They include:

- Single flipped fact: an asset held just under 12 months, which removes the CGT discount.
- Exact threshold: a value placed directly on a rate, cap, or eligibility boundary.
- Loss or zero: a scenario where the result is a loss or nil.
- Multi-step chain: a question that needs several steps in the right order.

For a trap question, one wrong option gives the naive answer. That is the answer a model reaches when it applies the standard rule and misses the exception.

One original calculation can therefore produce three evaluation targets: the held-out ATO original, a public traditional case with new numbers, and an edge case that changes the rule.

## Answers the verifier can recompute

Every question includes a stored formula and named inputs. A small calculator evaluates the arithmetic. It supports min, max, round, and abs, plus +, -, *, /, //, %, and **.

This supports three evaluation modes:

- Grade a submission: pass a CSV of id and answer. The verifier reports overall accuracy and per-topic accuracy.
- Recompute one case: point the verifier at a question id to rerun its formula and confirm the key.
- Expose a calculator: let the agent call the calculator while it solves, so it computes the number rather than relying on memory.

```bash
python verifier.py grade my_answers.csv
python verifier.py verify --id Q001
python verifier.py calc "(880000 - 615000) * 0.5"
```

## Using the benchmark to evaluate an agent

TaxBench-AU can run against any conversational or API agent. The simplest setup is deliberately narrow: show one question, ask for one letter, and grade that letter against the key.

A base prompt can look like this:

```text
You are a tax assistant. Answer the multiple-choice question by choosing the single best option.

{question}

A. {option_a}
B. {option_b}
C. {option_c}
D. {option_d}

Respond with only the letter of the correct answer.
```

From that base, evaluators can run three variants:

- Zero-shot: use the prompt above, with no reasoning requested.
- Explanation-first: ask for a short explanation before the final letter, so reviewers can inspect why the model chose its answer.
- Conversational framing: place the question inside a dialogue and optionally ask for a confidence level.

## Tool-use mode

A second setup gives the model access to a calculator, but not to the web or a tax database. This tests whether the model can identify the right rule and use a tool for the arithmetic.

For closed-book evaluation, block web access and tax-database retrieval. If an evaluation allows retrieval, measure that setting separately. Otherwise the score mixes tax calculation ability with search ability.

## What to measure

Overall accuracy matters, but it is not enough on its own. A stronger evaluation also tracks:

- Per-topic accuracy: group results by tax area. A model may handle CGT well but struggle with GST, FBT, or Division 7A.
- Edge-case accuracy: score the 40 edge cases separately to see whether the model handles traps and boundaries.
- Robustness: paraphrase questions or make small wording changes. Accuracy should stay stable when the model understands the rule.
- Error patterns: use the labelled wrong options to identify common failures, such as missed thresholds, unavailable discounts, wrong income years, or skipped steps.

These measures show where an agent is reliable and where it needs more work.

## What this benchmark does not claim

TaxBench-AU is a test tool, not tax or financial advice. The ATO does not endorse it. Teams should verify all figures before relying on them in real work.

The benchmark also depends on income years. Australian tax rates, thresholds, and rules change. An answer that is correct for one income year may be wrong for another.

Finally, the questions change the source examples rather than copying them verbatim. The dataset changes names and numbers, and the answer key cites the governing rule instead of relying on the original wording of the ATO example.

## Why this matters

AI tax agents are moving into work where a plausible answer is not enough. TaxBench-AU gives builders and evaluators a concrete way to ask the question that matters: can this agent calculate Australian tax, or is it only guessing convincingly?
