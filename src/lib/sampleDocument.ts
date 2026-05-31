export const SAMPLE_TITLE = "Benchmarking agents for Australian tax alignment";

export const SAMPLE_DOCUMENT_HTML = `
  <h1>Benchmarking agents for Australian tax alignment</h1>
  <p>As AI agents become more useful for professional work, we need better ways to evaluate whether they can support Australian tax tasks without drifting into confident but unsafe advice. This draft proposes a benchmark for measuring whether an agent can stay grounded in source material, preserve uncertainty, and escalate appropriately when the facts are incomplete.</p>
  <p>It is important to note that tax alignment is not merely about getting the final number right; it is about whether the model follows the process that a careful practitioner would expect. A robust benchmark should seamlessly capture residency questions, PAYG withholding variation evidence, GST registration context, deductions substantiation, superannuation obligations, and client-risk signals in a comprehensive framework.</p>
  <h2>What we test</h2>
  <p>The benchmark is organised around tasks that are common in practice: classifying facts, asking for missing information, identifying relevant ATO guidance, drafting client-facing explanations, and refusing to invent thresholds or lodgement obligations when the source material does not support them. Each task is evaluated against a rubric that rewards calibrated answers, clear caveats, and precise references.</p>
  <p>Division 293 matters.</p>
  <p>For example, an agent may be given a mixed file containing payslips, rental-property expenses, a private health insurance statement, and a client note about working from home. The aligned response should separate what can be inferred, what requires confirmation, and what should be checked against current ATO guidance. It should not turn a messy file into a polished answer just because the user sounds busy.</p>
  <h2>Why this is difficult</h2>
  <p>Australian tax work is full of things that look simple but become technical quickly. Residency, CGT events, PSI, GST, PAYG instalments, substantiation, Medicare levy surcharge, and superannuation all have edge cases that can be missed when the model tries to be helpful in a broad way.</p>
  <p>The benchmark is designed to be run in a controlled setting where the model is presented with realistic records, noisy instructions, and conflicting user goals, and its behaviour is assessed by independent reviewers who compare the answer with source-backed expectations, check whether the response was overconfident, and record whether the agent asked for the missing facts that would materially change the outcome.</p>
  <h2>What good behaviour looks like</h2>
  <p>A strong agent states the basis for its answer, distinguishes general information from advice, names the uncertainty, and keeps technical terms when they carry legal meaning. It should say "PAYG withholding variation" when that is the relevant mechanism, not "the tax thing"; it should say "substantiation" when the issue is evidence, not "paperwork".</p>
  <p>We expect this benchmark to help teams make better deployment decisions by showing where an agent can assist safely, where it needs human review, and where its language gives a false impression of authority.</p>
`;
