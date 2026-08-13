"""
Facial Recognition Service using InsightFace (ArcFace model).
Achieves ~99.8% accuracy on LFW benchmark.
Supports GPU (CUDA) acceleration when FR_GPU_ENABLED=true.

Architecture:
  1. Liveness detection (MiniFASNet) — reject spoofing attempts
  2. Face detection (RetinaFace) — accurate bounding box
  3. Image preprocessing (OpenCV) — normalize brightness, align
  4. Embedding generation (ArcFace) — 512-dim face vector
  5. Cosine similarity search against pgvector stored embeddings
"""
import asyncio
import io
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import cv2
import numpy as np
import structlog

from app.config import settings
from app.models.attendance import ScanResult
from app.services.storage_service import StorageService

logger = structlog.get_logger(__name__)

# Minimum gap between the top-2 cosine similarities required to accept a match.
# If two registered faces score within this margin, we refuse to guess and ask
# for another scan (prevents misidentifying people whose embeddings are close).
AMBIGUITY_MARGIN = 0.02


@dataclass
class FRMatchResult:
    result: ScanResult
    user_id: uuid.UUID | None = None
    confidence: float | None = None
    liveness_score: float | None = None
    failure_reason: str | None = None


class FacialRecognitionService:
    """
    Wraps InsightFace ArcFace model for OSCA facial recognition.
    Initialized once at application startup and shared via app.state.
    """

    def __init__(self) -> None:
        self._app: Any | None = None          # insightface.app.FaceAnalysis
        self._liveness_model: Any | None = None
        self._initialized = False
        self._storage = StorageService()

    async def initialize(self) -> None:
        """
        Load InsightFace models (runs in threadpool to avoid blocking event loop).
        Models are downloaded to ~/.insightface on first run.
        """
        if self._initialized:
            return
        await asyncio.get_event_loop().run_in_executor(None, self._load_models)
        self._initialized = True
        logger.info("fr_initialized", model=settings.FR_MODEL, gpu=settings.FR_GPU_ENABLED)

    def _load_models(self) -> None:
        """Blocking model load — called in executor."""
        import insightface
        from insightface.app import FaceAnalysis

        ctx_id = settings.FR_GPU_ID if settings.FR_GPU_ENABLED else -1

        self._app = FaceAnalysis(
            name="buffalo_l",      # ArcFace r100 — highest accuracy
            allowed_modules=["detection", "recognition"],
        )
        self._app.prepare(ctx_id=ctx_id, det_size=(640, 640))

        # Liveness model (MiniFASNet) loaded separately if enabled
        if settings.FR_LIVENESS_ENABLED:
            try:
                from app.services.liveness import LivenessDetector
                self._liveness_model = LivenessDetector()
            except ImportError:
                logger.warning("liveness_model_unavailable", note="Install silent-face-anti-spoofing")

    def _decode_image(self, image_bytes: bytes) -> np.ndarray:
        """Decode bytes to BGR numpy array (OpenCV format)."""
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image")
        return img

    def _preprocess(self, img: np.ndarray) -> np.ndarray:
        """
        OpenCV preprocessing pipeline:
        1. Resize if too large (keep aspect ratio)
        2. CLAHE for lighting normalization
        3. Convert to RGB for InsightFace
        """
        max_dim = 1280
        h, w = img.shape[:2]
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)))

        # CLAHE on L-channel of LAB (fixes uneven lighting in sports venues)
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        lab[:, :, 0] = clahe.apply(lab[:, :, 0])
        img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

        return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    def _get_embedding(self, img_rgb: np.ndarray) -> np.ndarray | None:
        """Extract 512-dim ArcFace embedding. Returns None if no face detected."""
        if self._app is None:
            raise RuntimeError("FR service not initialized")
        faces = self._app.get(img_rgb)
        if not faces:
            return None
        # Take the largest face (closest to camera)
        face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return face.embedding

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Compute cosine similarity between two L2-normalized vectors."""
        a_norm = a / (np.linalg.norm(a) + 1e-10)
        b_norm = b / (np.linalg.norm(b) + 1e-10)
        return float(np.dot(a_norm, b_norm))

    async def enroll_face(
        self,
        user_id: str,
        images_bytes: list[bytes],
    ) -> tuple[list[float], str, list[str]]:
        """
        Generate and return the mean ArcFace embedding from multiple enrollment images.
        Returns: (embedding_vector, model_name, minio_keys)
        """
        loop = asyncio.get_event_loop()

        def _compute():
            embeddings = []
            for img_bytes in images_bytes:
                img = self._decode_image(img_bytes)
                img_rgb = self._preprocess(img)
                emb = self._get_embedding(img_rgb)
                if emb is not None:
                    embeddings.append(emb)

            if len(embeddings) < 3:
                raise ValueError(
                    f"Only {len(embeddings)} faces detected from {len(images_bytes)} images. "
                    "Ensure face is clearly visible in at least 3 images."
                )

            # Mean pooling of embeddings → more robust than single-image
            mean_emb = np.mean(embeddings, axis=0)
            mean_emb = mean_emb / np.linalg.norm(mean_emb)  # L2 normalize
            return mean_emb.tolist()

        embedding = await loop.run_in_executor(None, _compute)

        # Upload raw images to MinIO (kept for FACE_IMAGE_RETENTION_DAYS)
        minio_keys = []
        for i, img_bytes in enumerate(images_bytes):
            key = f"enrollments/{user_id}/img_{i}.jpg"
            await self._storage.upload_bytes(
                bucket=settings.MINIO_BUCKET_FACES,
                key=key,
                data=img_bytes,
                content_type="image/jpeg",
            )
            minio_keys.append(key)

        return embedding, "insightface_arcface_buffalo_l", minio_keys

    async def identify_face(
        self,
        image_bytes: bytes,
        stored_embeddings: list[tuple[uuid.UUID, list[float]]],
        similarity_threshold: float | None = None,
        liveness_threshold: float | None = None,
        liveness_enabled: bool | None = None,
    ) -> FRMatchResult:
        """
        Identify a face against all stored embeddings.
        Runs liveness check first if enabled.

        similarity_threshold / liveness_threshold / liveness_enabled override
        static settings when provided (used for runtime admin configuration).
        """
        loop = asyncio.get_event_loop()

        # Resolve effective thresholds (runtime config takes precedence)
        _sim_threshold = similarity_threshold if similarity_threshold is not None else settings.FACE_SIMILARITY_THRESHOLD
        _live_threshold = liveness_threshold if liveness_threshold is not None else settings.FR_LIVENESS_THRESHOLD
        _live_enabled = liveness_enabled if liveness_enabled is not None else settings.FR_LIVENESS_ENABLED

        def _run():
            try:
                img = self._decode_image(image_bytes)
            except Exception:
                return FRMatchResult(
                    result=ScanResult.NO_FACE_DETECTED,
                    failure_reason="Invalid image frame. Please ensure a valid camera image.",
                )
            img_rgb = self._preprocess(img)

            # Liveness check
            liveness_score = None
            if _live_enabled and self._liveness_model:
                liveness_score = self._liveness_model.predict(img_rgb)
                if liveness_score < _live_threshold:
                    return FRMatchResult(
                        result=ScanResult.FAILED_LIVENESS,
                        liveness_score=liveness_score,
                        failure_reason=f"Liveness check failed (score={liveness_score:.3f}). "
                                       "Please face the camera directly without using a photo.",
                    )

            # Extract embedding
            query_emb = self._get_embedding(img_rgb)
            if query_emb is None:
                return FRMatchResult(
                    result=ScanResult.NO_FACE_DETECTED,
                    liveness_score=liveness_score,
                    failure_reason="No face detected. Please face the camera directly.",
                )

            query_arr = np.array(query_emb)

            # Compare against all stored embeddings
            best_score = -1.0
            best_user_id = None
            second_score = -1.0

            for user_id, stored_emb in stored_embeddings:
                stored_arr = np.array(stored_emb)
                score = self._cosine_similarity(query_arr, stored_arr)
                if score > best_score:
                    second_score = best_score
                    best_score = score
                    best_user_id = user_id
                elif score > second_score:
                    second_score = score

            if best_score < _sim_threshold:
                return FRMatchResult(
                    result=ScanResult.FAILED_THRESHOLD,
                    confidence=best_score,
                    liveness_score=liveness_score,
                    failure_reason=(
                        f"Face not recognized (confidence={best_score:.3f}, "
                        f"threshold={_sim_threshold}). "
                        "Ensure good lighting and face the camera directly."
                    ),
                )

            # Safety: if two profiles score almost equally, do not guess — ask to rescan.
            if second_score >= 0 and (best_score - second_score) < AMBIGUITY_MARGIN:
                return FRMatchResult(
                    result=ScanResult.FAILED_RECOGNITION,
                    confidence=best_score,
                    liveness_score=liveness_score,
                    failure_reason=(
                        f"Multiple possible matches found (closest scores "
                        f"{best_score:.3f} and {second_score:.3f}). "
                        "Please scan again with clear lighting."
                    ),
                )

            return FRMatchResult(
                result=ScanResult.SUCCESS,
                user_id=best_user_id,
                confidence=best_score,
                liveness_score=liveness_score,
            )

        return await loop.run_in_executor(None, _run)
