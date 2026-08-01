// client/lib/webcamUtil.ts
import * as tf from '@tensorflow/tfjs';

/**
 * Captures a frame from a video element, center-crops it to a square,
 * resizes it to 128x128, and normalizes pixels to [0, 1].
 */
export function captureAndProcessFrame(videoElement: HTMLVideoElement): tf.Tensor3D | null {
    if (!videoElement || videoElement.readyState !== 4) return null; // Ensure video is ready

    const tensor = tf.tidy(() => {
        // 1. Capture tensor from pixels
        const raw = tf.browser.fromPixels(videoElement);
        const [height, width] = raw.shape;

        // 2. Center crop to square
        const size = Math.min(width, height);
        const yIndex = Math.floor((height - size) / 2);
        const xIndex = Math.floor((width - size) / 2);
        
        const cropped = tf.image.cropAndResize(
            raw.expandDims(0), // Requires 4D batch tensor
            [[yIndex / height, xIndex / width, (yIndex + size) / height, (xIndex + size) / width]],
            [0], // boxIndex
            [128, 128] // output shape
        );

        // 3. Normalize pixels from [0-255] to [0, 1]
        const normalized = tf.squeeze(cropped).div(255.0);
        
        return normalized as tf.Tensor3D;
    });

    return tensor;
}