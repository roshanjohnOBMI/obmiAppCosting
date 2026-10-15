/** Quality base: how strongly each tool protects each information-quality dimension (0 none, 1 low, 2 medium, 3 strong).
 *  Professional judgement ratings against ISO 19650 information-quality themes, NOT measurements. Editable on the page. */
export const QDIMS = ["Completeness", "Accuracy", "Consistency", "Timeliness", "Traceability"] as const;
export type QDim = (typeof QDIMS)[number];

export const QDESC: Record<QDim, string> = {
  Completeness: "Nothing required is missing: parameters, deliverables, models, checks.",
  Accuracy: "Values and results are correct and fixable at source.",
  Consistency: "Same standard applied the same way across every model and discipline.",
  Timeliness: "Issues are seen in the cycle they occur, not weeks later.",
  Traceability: "Who decided what and when is recorded and exportable.",
};

export interface QProfile {
  tool: string;
  prevents: string;
  scores: [number, number, number, number, number];
}

export const QUALITY: QProfile[] = [
  { tool: "Clash Parameters", prevents: "Elements reaching coordination without a Clash Code or Zone.", scores: [3, 3, 2, 1, 1] },
  { tool: "Shared Parameters", prevents: "Missing or wrongly defined shared parameters in a model.", scores: [2, 3, 3, 1, 1] },
  { tool: "Warning Remover", prevents: "Unresolved Revit warnings and duplicate marks left in issued models.", scores: [1, 3, 1, 1, 1] },
  { tool: "Workset Assigner", prevents: "Elements on the wrong workset, breaking visibility and ownership.", scores: [2, 2, 3, 1, 1] },
  { tool: "Link Loader", prevents: "Links left unloaded or stale during checks and exports.", scores: [1, 1, 2, 2, 0] },
  { tool: "Model Health Check (add-in)", prevents: "Models issued without a self-check against the QA catalog.", scores: [3, 3, 2, 2, 2] },
  { tool: "Parameter Updater", prevents: "Hand-keyed parameter values and asset codes drifting from the mapping.", scores: [2, 3, 3, 1, 2] },
  { tool: "Clash Tolerance", prevents: "Tests run with inconsistent tolerances, so results are not comparable.", scores: [0, 2, 3, 1, 0] },
  { tool: "Clash Approval", prevents: "Clash decisions with no recorded approver, date or comment.", scores: [2, 2, 2, 2, 3] },
  { tool: "Clash Analyser", prevents: "Coordination meetings run on stale or hand-built clash counts.", scores: [2, 2, 1, 3, 3] },
  { tool: "Parameter Checker", prevents: "Missing clash code or zone across 100-115 models going unseen.", scores: [3, 3, 1, 1, 2] },
  { tool: "Viewpoint Comments", prevents: "Viewpoint comments lost or untracked between rounds.", scores: [1, 1, 2, 1, 3] },
  { tool: "Hide By Category", prevents: "Inconsistent visibility states when reviewing and screenshotting.", scores: [0, 1, 2, 1, 0] },
  { tool: "ACC vs TIDP/MIDP Checker", prevents: "Missing, partial, duplicate or mis-named deliverables against the plan.", scores: [3, 3, 2, 3, 3] },
  { tool: "ACC Model Health Check", prevents: "Models not QA-checked, or checked differently, before sharing.", scores: [3, 3, 3, 3, 3] },
  { tool: "Meridian", prevents: "Compliance and progress measured by hand, differently per trade.", scores: [3, 2, 3, 3, 3] },
  { tool: "Add-in Control", prevents: "Users on different or unapproved add-in versions.", scores: [1, 2, 3, 2, 3] },
];
