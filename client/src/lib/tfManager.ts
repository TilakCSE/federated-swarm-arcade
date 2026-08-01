// client/lib/tfManager.ts
import * as tf from '@tensorflow/tfjs';

/**
 * Initializes or loads the client-side model matching the server's CNN structure.
 */
export async function createClientModel(): Promise<tf.Sequential> {
    const model = tf.sequential();

    model.add(tf.layers.conv2d({
        inputShape: [128, 128, 3],
        kernelSize: 3,
        filters: 16,
        activation: 'relu'
    }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));

    model.add(tf.layers.conv2d({
        kernelSize: 3,
        filters: 32,
        activation: 'relu'
    }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2, strides: 2 }));

    model.add(tf.layers.flatten());
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 4, activation: 'softmax' }));

    model.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });

    return model;
}

/**
 * Updates the local client model with weights dispatched from the Parameter Server (Step 1)
 */
export async function setModelWeights(model: tf.Sequential, serializedWeights: any[]) {
    const tensors = serializedWeights.map(w => tf.tensor(new Float32Array(w.data), w.shape));
    model.setWeights(tensors);
    // Cleanup tensor memory
    tensors.forEach(t => t.dispose());
}

/**
 * Extracts current weights as serializable binary objects for WebSocket transmission (Step 3)
 */
export async function serializeModelWeights(model: tf.Sequential) {
    const weights = model.getWeights();
    return await Promise.all(
        weights.map(async (tensor) => {
            const data = await tensor.data(); // This is a Float32Array
            return {
                data: data.buffer, // <-- Send raw binary buffer, NOT a JSON array
                shape: tensor.shape
            };
        })
    );
}

export async function trainModel(
    model: tf.Sequential, 
    xDataset: tf.Tensor, 
    yDataset: tf.Tensor, 
    onEpochEnd: (epoch: number, logs?: tf.Logs) => void
) {
    // We use a small epoch count because Edge FL relies on frequent, small updates 
    // rather than training to convergence locally.
    await model.fit(xDataset, yDataset, {
        epochs: 5,
        batchSize: 16, // Small batch size for browser memory constraints
        shuffle: true,
        callbacks: {
            onEpochEnd: (epoch, logs) => onEpochEnd(epoch, logs)
        }
    });
}