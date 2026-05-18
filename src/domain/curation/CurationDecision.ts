export type DecisionType = 'approve' | 'reject' | 'hold';

export type RejectionReasonEnum = 'ad' | 'ordinary' | 'low_quality' | 'duplicate' | 'other';

export interface CurationDecision {
  readonly id: string;
  readonly candidateId: string;
  readonly decidedAt: string;        // ISO timestamp
  readonly decidedBy: string;        // curator username
  readonly decision: DecisionType;
  readonly curationScore: number | null;            // non-null when decision='approve'
  readonly rejectionReasonEnum: RejectionReasonEnum | null;
  readonly rejectionReasonText: string | null;
  readonly aiEstimatedScore: number | null;         // v1 null
  readonly aiEstimatedAt: string | null;            // v1 null
  readonly curatorOverride: boolean | null;         // v1 null
  readonly freeMemo: string | null;
  readonly createdAt: string;        // ISO timestamp
}
