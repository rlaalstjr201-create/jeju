import type { CreateTripUseCase } from '../../application/core-flow/CreateTripUseCase.js';
import type { GetRecommendationsUseCase } from '../../application/core-flow/GetRecommendationsUseCase.js';
import type { UpdateShortlistUseCase } from '../../application/core-flow/UpdateShortlistUseCase.js';
import type { ComposeDayPlanUseCase } from '../../application/core-flow/ComposeDayPlanUseCase.js';
import type { EditDayPlanUseCase } from '../../application/core-flow/EditDayPlanUseCase.js';
import type { DiscoverCandidatesUseCase } from '../../application/curation/DiscoverCandidatesUseCase.js';
import type { ListCandidatesUseCase } from '../../application/curation/ListCandidatesUseCase.js';
import type { EnrichCandidateUseCase } from '../../application/curation/EnrichCandidateUseCase.js';
import type { ApproveCandidateUseCase } from '../../application/curation/ApproveCandidateUseCase.js';
import type { RejectCandidateUseCase } from '../../application/curation/RejectCandidateUseCase.js';
import type { AdjustCalibrationUseCase } from '../../application/curation/AdjustCalibrationUseCase.js';
import type { RunDiscoveryPipelineUseCase } from '../../application/curation/RunDiscoveryPipelineUseCase.js';
import type { PatchCandidateCoordinatesUseCase } from '../../application/curation/PatchCandidateCoordinatesUseCase.js';
import type { EmbeddingBatcherPort } from '../../application/ports/EmbeddingBatcherPort.js';
import type { LabelStudioBridgePort } from '../../application/ports/LabelStudioBridgePort.js';
import type { CurationCandidate } from '../../domain/curation/CurationCandidate.js';
import type { ListApprovedSpotsUseCase } from '../../application/spots/ListApprovedSpotsUseCase.js';
import type { GetSpotByIdUseCase } from '../../application/spots/GetSpotByIdUseCase.js';

export interface AppDependencies {
  createTripUseCase: CreateTripUseCase;
  getRecommendationsUseCase: GetRecommendationsUseCase;
  updateShortlistUseCase: UpdateShortlistUseCase;
  composeDayPlanUseCase: ComposeDayPlanUseCase;
  editDayPlanUseCase: EditDayPlanUseCase;
  discoverCandidatesUseCase: DiscoverCandidatesUseCase;
  listCandidatesUseCase: ListCandidatesUseCase;
  enrichCandidateUseCase: EnrichCandidateUseCase;
  approveCandidateUseCase: ApproveCandidateUseCase;
  rejectCandidateUseCase: RejectCandidateUseCase;
  adjustCalibrationUseCase: AdjustCalibrationUseCase;
  runDiscoveryPipelineUseCase: Pick<RunDiscoveryPipelineUseCase, 'execute'>;
  getCandidateByIdUseCase: { execute(id: string): Promise<CurationCandidate | undefined> };
  patchCandidateCoordinatesUseCase: Pick<PatchCandidateCoordinatesUseCase, 'execute'>;
  embeddingBatcher: EmbeddingBatcherPort;
  labelStudioBridge: LabelStudioBridgePort;
  listApprovedSpotsUseCase: ListApprovedSpotsUseCase;
  getSpotByIdUseCase: GetSpotByIdUseCase;
}
