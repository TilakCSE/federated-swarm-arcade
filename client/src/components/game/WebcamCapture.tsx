// client/components/game/WebcamCapture.tsx
'use client';
import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { captureAndProcessFrame } from '@/lib/webcamUtil';
import * as tf from '@tensorflow/tfjs';

export interface WebcamRef {
    captureTensor: () => tf.Tensor3D | null;
}

const WebcamCapture = forwardRef<WebcamRef, {}>((props, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [streamReady, setStreamReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Expose the tensor capture function to the parent (main loop)
    useImperativeHandle(ref, () => ({
        captureTensor: () => {
            if (!videoRef.current) return null;
            return captureAndProcessFrame(videoRef.current);
        }
    }));

    useEffect(() => {
        async function setupWebcam() {
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("Webcam API not supported in this browser.");
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 320, height: 320, facingMode: 'user' }, // Lean resolution for capture
                    audio: false
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play();
                        setStreamReady(true);
                        requestAnimationFrame(drawPreviewLoop);
                    };
                }
            } catch (e: any) {
                setError(e.message);
                console.error("Webcam Setup Error:", e);
            }
        }

        // Draw video feed to canvas for player visibility
        function drawPreviewLoop() {
            if (canvasRef.current && videoRef.current && streamReady) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    // Mirror feed for natural user interaction
                    ctx.save();
                    ctx.scale(-1, 1);
                    ctx.drawImage(videoRef.current, -320, 0, 320, 320);
                    ctx.restore();
                }
                requestAnimationFrame(drawPreviewLoop);
            }
        }

        setupWebcam();

        return () => {
            // Cleanup stream
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [streamReady]);

    if (error) {
        return (
            <div className="border-2 border-red-500 bg-red-900/50 p-4 rounded text-center">
                <p className="font-bold text-red-200">Webcam Error</p>
                <p className="text-sm text-red-300">{error}</p>
            </div>
        );
    }

    return (
        <div className="relative border-4 border-gray-700 bg-black rounded-lg overflow-hidden w-[320px] h-[320px]">
            {/* Hidden Video element for raw feed */}
            <video ref={videoRef} className="hidden" muted />
            
            {/* Visible Canvas for user preview (Mirrored) */}
            <canvas ref={canvasRef} width={320} height={320} />
            
            {!streamReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-400">
                    Requesting Camera Access...
                </div>
            )}
        </div>
    );
});

WebcamCapture.displayName = 'WebcamCapture';
export default WebcamCapture;