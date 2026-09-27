export type Report = {
  id: string;
  tracking_code: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  photo_url: string | null;
  video_url: string | null;
  text_description: string | null;
  transcript: string | null;
  location: string | null;
  category: string | null;
  severity_score: number | null;
  confidence_score: number | null;
  duplicate_of: string | null;
  model_name: string | null;
  gpu_type: string | null;
  latency_ms: number | null;
  status: string | null;
  created_at: string | null;
};

export type QueueEntry = Report & { duplicates: Report[]; duplicate_count: number };

export const RESPONSIBLE_AI_LINE =
  "CivicFix AI provides prioritization support. It does not make final decisions, profile individuals, or act autonomously. Low confidence results are flagged for human review.";

export function severityTone(score: number | null): string {
  if ((score ?? 0) >= 8) return "bg-critical text-critical-foreground";
  if ((score ?? 0) >= 5) return "bg-warn text-warn-foreground";
  return "bg-calm text-calm-foreground";
}
