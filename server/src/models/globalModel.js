// server/src/models/globalModel.js
const tf = require('@tensorflow/tfjs-node');

/**
 * Initializes a lightweight CNN for gesture recognition.
 * We use a sequential model designed to be lean for Edge FL.
 */
function createGlobalModel() {
    const model = tf.sequential();

    // Input shape assumes a 128x128 grayscale or RGB image from the webcam
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
    
    // Dense layers for classification (e.g., 4 specific game gestures)
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 4, activation: 'softmax' }));

    model.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });

    console.log("Global Model Initialized. Parameter count is minimized for edge transmission.");
    return model;
}

module.exports = { createGlobalModel };