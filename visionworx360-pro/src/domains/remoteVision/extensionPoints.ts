/**
 * Module 011 — AI-ready extension points.
 *
 * NOTHING here is implemented in Version 1. These are the seams a future
 * vision pipeline plugs into; today `nullVisionProvider` + the deterministic
 * description analyzer satisfy `VisionAnalysisProvider`.
 */
import type {
  ConfidenceScore,
  DetectedFeatureBase,
  DetectedRoom,
  RemoteVisionMedia,
  VisionAnalysisResult,
} from "./types";

/** Automatic object detection over a single image. */
export interface ImageRecognitionExtension {
  recognizeObjects(media: RemoteVisionMedia): Promise<DetectedFeatureBase[]>;
}

/** Before-photo vs after-rendering diffing (added/removed elements). */
export interface RenderingComparisonExtension {
  compare(before: RemoteVisionMedia[], after: RemoteVisionMedia[]): Promise<{
    added: DetectedFeatureBase[];
    removed: DetectedFeatureBase[];
    changed: DetectedFeatureBase[];
    confidence: ConfidenceScore;
  }>;
}

/** Surface/finish classification (cabinet grade, counter material, trim). */
export interface MaterialRecognitionExtension {
  recognizeMaterials(media: RemoteVisionMedia[]): Promise<DetectedFeatureBase[]>;
}

/** Room segmentation from photos or a floor plan. */
export interface RoomDetectionExtension {
  detectRooms(media: RemoteVisionMedia[]): Promise<DetectedRoom[]>;
}

/** Finish-level grading (builder / mid / premium) from imagery. */
export interface FinishRecognitionExtension {
  gradeFinishes(media: RemoteVisionMedia[]): Promise<
    Array<{ featureKey: string; gradeKey: string; confidence: ConfidenceScore }>
  >;
}

/** Takeoff quantities (SF of flooring, LF of cabinet run) from imagery/plans. */
export interface QuantityEstimationExtension {
  estimateQuantities(
    media: RemoteVisionMedia[],
    features: DetectedFeatureBase[],
  ): Promise<Array<{ featureKey: string; quantity: number; unitKey: string; confidence: ConfidenceScore }>>;
}

/** A full future pipeline composes the extensions into one analysis result. */
export interface VisionPipelineExtension {
  imageRecognition?: ImageRecognitionExtension;
  renderingComparison?: RenderingComparisonExtension;
  materialRecognition?: MaterialRecognitionExtension;
  roomDetection?: RoomDetectionExtension;
  finishRecognition?: FinishRecognitionExtension;
  quantityEstimation?: QuantityEstimationExtension;
  merge(partials: Partial<VisionAnalysisResult>[]): VisionAnalysisResult;
}
