"use client";

import * as React from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  MapPin,
  ShieldAlert,
  UserX,
  Users,
  VideoOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getApiError } from "@/lib/api-error";
import { useCheckInMutation } from "@/store/api/attendanceApi";

/**
 * Camera check-in dialog (Phase 10 bonus — brief Section 5).
 *
 * Flow (brief figure): Open camera → detect face (exactly one) → get GPS →
 * send to server (time server-stamped) → server geofence + rules → saved.
 *
 * Brief guardrails implemented here:
 *  - Reject when 0 ya 2+ faces (client blocks the button, server audit trail
 *    ko source:"camera" milta hai)
 *  - GPS accuracy worse than 100 m → block (server bhi enforce karta hai)
 *  - Privacy: NO photo is stored/uploaded — sirf face-count result + coords
 *  - Model load fail (offline) → graceful message + fallback to web check-in
 *
 * Face model: MediaPipe BlazeFace (local /models + /mediapipe/wasm — self
 * hosted, no CDN dependency).
 */

const WASM_PATH = "/mediapipe/wasm";
const MODEL_PATH = "/models/blaze_face_short_range.tflite";
const MAX_GPS_ACCURACY_M = 100; // brief: reject if accuracy is worse than 100 m

const FACE_STATE = {
  loading: { label: "Loading face detector…", tone: "text-muted-foreground", ok: false },
  none: { label: "No face in frame", tone: "text-warning", ok: false },
  one: { label: "Face detected — exactly one", tone: "text-success", ok: true },
  many: { label: "Multiple faces — not allowed", tone: "text-destructive", ok: false },
  failed: { label: "Detector unavailable — use standard check-in", tone: "text-warning", ok: false },
};

export function getPosition() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ ok: false, reason: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => resolve({ ok: false, reason: err?.code === 1 ? "denied" : "failed" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

export function CameraCheckInDialog({ open, onOpenChange, onDone }) {
  const [checkIn, { isLoading: checkingIn }] = useCheckInMutation();

  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const detectorRef = React.useRef(null);
  const timerRef = React.useRef(null);
  const lastTsRef = React.useRef(0);

  const [camState, setCamState] = React.useState("starting"); // starting|ready|denied|error
  const [faceState, setFaceState] = React.useState("loading");
  const [loc, setLoc] = React.useState(null); // {lat,lng,accuracy} | null
  const [locMsg, setLocMsg] = React.useState("Location check-in ke waqt li jayegi.");
  const [submitError, setSubmitError] = React.useState(null);

  // ---- Camera + detector lifecycle ----
  React.useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    async function start() {
      setCamState("starting");
      setFaceState("loading");
      setSubmitError(null);
      setLoc(null);
      setLocMsg("Location check-in ke waqt li jayegi.");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamState("ready");
      } catch (err) {
        if (cancelled) return;
        setCamState(err?.name === "NotAllowedError" ? "denied" : "error");
        return;
      }

      // Detector — lazy import, GPU pehle phir CPU fallback
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
        const build = (delegate) =>
          FaceDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_PATH, delegate },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.5,
          });
        let detector;
        try {
          detector = await build("GPU");
        } catch {
          detector = await build("CPU");
        }
        if (cancelled) {
          detector?.close?.();
          return;
        }
        detectorRef.current = detector;
        setFaceState("none");

        // Detection loop — 400ms polling (check-in ke liye kafi, battery-friendly)
        timerRef.current = window.setInterval(async () => {
          const video = videoRef.current;
          const det = detectorRef.current;
          if (!video || !det || video.readyState < 2) return;
          const ts = performance.now();
          if (ts <= lastTsRef.current) return; // VIDEO mode needs increasing ts
          lastTsRef.current = ts;
          try {
            const result = det.detectForVideo(video, ts);
            const count = result?.detections?.length ?? 0;
            setFaceState(count === 0 ? "none" : count === 1 ? "one" : "many");
          } catch {
            // transient frame error — state rehne do
          }
        }, 400);
      } catch {
        if (!cancelled) setFaceState("failed");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      detectorRef.current?.close?.();
      detectorRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open]);

  async function grabLocation() {
    setLocMsg("Getting GPS…");
    const pos = await getPosition();
    if (!pos.ok) {
      setLoc(null);
      setLocMsg(
        pos.reason === "denied"
          ? "Location denied — camera check-in needs GPS. Allow it ya web check-in use karein."
          : "No GPS fix — dobara try karein ya web check-in use karein."
      );
      return null;
    }
    if (pos.accuracy > MAX_GPS_ACCURACY_M) {
      setLoc(null);
      setLocMsg(
        `GPS accuracy ${Math.round(pos.accuracy)} m — worse than ${MAX_GPS_ACCURACY_M} m limit. Move near a window / open space and retry.`
      );
      return null;
    }
    setLoc({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
    setLocMsg(`GPS locked · ±${Math.round(pos.accuracy)} m accuracy.`);
    return pos;
  }

  async function handleSubmit() {
    setSubmitError(null);
    const pos = await grabLocation();
    if (!pos) return; // accuracy/geofence guard — brief rule
    try {
      const res = await checkIn({
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        source: "camera",
      }).unwrap();
      onOpenChange(false);
      onDone?.(res?.data);
    } catch (err) {
      const { message } = getApiError(err);
      setSubmitError(message);
      toast.error(message);
    }
  }

  const face = FACE_STATE[faceState] ?? FACE_STATE.loading;
  const canSubmit = camState === "ready" && face.ok && !checkingIn;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Camera check-in</DialogTitle>
          <DialogDescription>
            Face detect hoga, GPS verify hoga, phir server check-in stamp karega —
            time hamesha server ka hota hai.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Live preview */}
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted/60">
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full scale-x-[-1] object-cover"
            />
            {camState !== "ready" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                {camState === "starting" ? (
                  <>
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Starting camera…</p>
                  </>
                ) : (
                  <>
                    <VideoOff className="size-6 text-warning" />
                    <p className="text-xs text-muted-foreground">
                      {camState === "denied"
                        ? "Camera permission denied — browser settings me allow karein ya web check-in use karein."
                        : "Camera unavailable — web check-in ya HR correction use karein."}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`size-40 rounded-full border-2 transition-colors sm:size-44 ${
                    face.ok ? "border-success/70" : "border-muted-foreground/30"
                  }`}
                />
              </div>
            )}
          </div>

          {/* Status lines */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {faceState === "loading" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              ) : face.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" />
              ) : faceState === "many" ? (
                <Users className="size-4 shrink-0 text-destructive" />
              ) : (
                <UserX className="size-4 shrink-0 text-warning" />
              )}
              <p className={face.tone}>{face.label}</p>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{locMsg}</p>
            </div>
          </div>

          {submitError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
              {submitError}
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={grabLocation} variant="outline" size="sm" disabled={camState !== "ready"}>
              <MapPin className="size-4" /> Check GPS
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="min-w-40 flex-1"
              size="sm"
            >
              {checkingIn ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              {checkingIn ? "Checking in…" : "Check in with camera"}
            </Button>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3 shrink-0" />
            Privacy: koi photo store ya upload NAHI hoti — sirf face-count result aur
            GPS coordinates server jate hain. Failed check HR correction se cover hota hai.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
