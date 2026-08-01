// client/src/app/page.tsx
'use client';
import React, { useRef, useState, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import WebcamCapture from '@/components/game/WebcamCapture';
import GameCanvas from '@/components/game/GameCanvas';
import { useFederatedSocket } from '@/lib/useFederatedSocket';
import { createClientModel, setModelWeights, serializeModelWeights, trainModel } from '@/lib/tfManager';

export default function FederatedSwarmArcade() {
    const webcamRef = useRef<any>(null);
    const modelRef = useRef<any>(null);
    const mainLoopId = useRef<any>(null);
    
    // Dataset memory references
    const trainingData = useRef<{ xs: tf.Tensor3D[], ys: number[] }>({ xs: [], ys: [] });

    const [status, setStatus] = useState<string>('Initializing local engine...');
    const [localAccuracy, setLocalAccuracy] = useState<number>(0);
    const [currentGesture, setCurrentGesture] = useState<string>('Awaiting Input');
    const [tfReady, setTfReady] = useState<boolean>(false);
    
    // UI State for data collection
    const [sampleCounts, setSampleCounts] = useState([0, 0, 0, 0]);

    const [isTraining, setIsTraining] = useState<boolean>(false);
    const isTrainingRef = useRef<boolean>(false);

    const GESTURE_MAP = ['Neutral', 'Move Left', 'Move Right', 'Attack'];

    const { socket, swarmPoints, submitScore } = useFederatedSocket(async (weights) => {
        if (!modelRef.current) return;
        setStatus('Synchronizing with Global Model...');
        await setModelWeights(modelRef.current, weights);
        setStatus('System Ready. Awaiting gestures.');
    });

    useEffect(() => {
        async function initializeLocalTf() {
            await tf.setBackend('webgl');
            await tf.ready();
            modelRef.current = await createClientModel();
            
            setTfReady(true);
            mainLoopId.current = requestAnimationFrame(gameMainLoop);
        }
        initializeLocalTf();

        return () => {
            if (mainLoopId.current) cancelAnimationFrame(mainLoopId.current);
            if (modelRef.current) modelRef.current.dispose();
            tf.disposeVariables(); 
        };
    }, []);

    useEffect(() => {
        if (socket && tfReady) {
            setStatus('Requesting global model dispatch...');
            socket.emit('request_model');
        }
    }, [socket, tfReady]);

    function gameMainLoop() {
        tf.tidy(() => {
            // Safely bypass prediction while WebGL is busy training
            if (modelRef.current && webcamRef.current && !isTrainingRef.current) {
                const frameTensor = webcamRef.current.captureTensor();
                if (frameTensor) {
                    const prediction = modelRef.current.predict(frameTensor.expandDims(0)) as tf.Tensor;
                    const gestureIndex = prediction.argMax(1).dataSync()[0];
                    
                    // Remove confidence threshold - always execute the most likely command
                    setCurrentGesture(GESTURE_MAP[gestureIndex]);
                }
            }
        });
        mainLoopId.current = requestAnimationFrame(gameMainLoop);
    }

    // 1. Data Collection Function
    const recordSample = (classId: number) => {
        if (!webcamRef.current) return;
        const frame = webcamRef.current.captureTensor();
        if (frame) {
            // Store tensor locally (Never leaves the device - Privacy NFR)
            trainingData.current.xs.push(frame.clone()); // Clone prevents disposal in loop
            trainingData.current.ys.push(classId);
            
            setSampleCounts(prev => {
                const updated = [...prev];
                updated[classId]++;
                return updated;
            });
        }
    };

    // 2. Local Training & Dispatch Loop
    const executeLocalTraining = async () => {
        if (trainingData.current.xs.length === 0 || !modelRef.current || !socket) return;
        
        setIsTraining(true);
        isTrainingRef.current = true; // Pause inference loop

        setStatus('Compiling local dataset...');
        
        const xs = tf.stack(trainingData.current.xs);
        const ys = tf.oneHot(tf.tensor1d(trainingData.current.ys, 'int32'), 4);

        setStatus('Training Local Model...');
        await trainModel(modelRef.current, xs, ys, (epoch, logs) => {
            setStatus(`Epoch ${epoch + 1}/5 | Loss: ${logs?.loss.toFixed(4)}`);
            if (logs?.acc !== undefined) setLocalAccuracy(logs.acc);
        });

        setStatus('Extracting weights...');
        const serializedWeights = await serializeModelWeights(modelRef.current);
        
        socket.emit('client_update', serializedWeights);
        setStatus('Weights securely transmitted for Aggregation.');

        tf.dispose([xs, ys]);
        trainingData.current.xs.forEach(t => t.dispose());
        trainingData.current = { xs: [], ys: [] };
        setSampleCounts([0, 0, 0, 0]);
        
        setIsTraining(false);
        isTrainingRef.current = false; // Resume inference loop
    };

    return (
        <main className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans">
            <header className="flex justify-between items-center pb-6 mb-6">
                <h1 className="text-2xl font-bold text-slate-100 tracking-wide uppercase">
                    Federated Swarm
                </h1>
                <div className="bg-indigo-600 text-white px-5 py-2 rounded-md font-mono font-medium shadow-lg shadow-indigo-500/20">
                    {`Swarm Points: ${swarmPoints.toLocaleString()}`}
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 h-[75vh] relative flex flex-col">
                <GameCanvas 
                    currentGesture={currentGesture} 
                    isTraining={isTraining} 
                    onSessionEnd={submitScore} // <--- Pass the function here
                />
                </div>

                <aside className="space-y-4 overflow-y-auto pr-2 max-h-[75vh]">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                            Live Telemetry
                        </h2>
                        <div className="rounded-lg overflow-hidden border border-slate-800 bg-black">
                            <WebcamCapture ref={webcamRef} />
                        </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-1">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Engine Status</p>
                        <p className="font-medium text-indigo-400">{status}</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                        <p className="text-xs text-slate-500 uppercase tracking-wider">Validation Accuracy</p>
                        <p className="text-3xl font-light text-slate-100 pt-1">
                            {(localAccuracy * 100).toFixed(1)}<span className="text-lg text-slate-500">%</span>
                        </p>
                    </div>

                    {/* NEW: Local Data Collection & Training Interface */}
                    <div className="bg-slate-900 border border-indigo-900/50 p-5 rounded-xl space-y-4">
                        <p className="text-xs text-indigo-400 uppercase tracking-wider font-bold">Local Data Collection</p>
                        <div className="grid grid-cols-2 gap-2">
                            {GESTURE_MAP.map((label, index) => (
                                <button 
                                    key={index}
                                    onMouseDown={() => recordSample(index)}
                                    className="p-2 bg-slate-800 hover:bg-slate-700 active:bg-indigo-600 rounded text-xs font-medium border border-slate-700 transition flex justify-between items-center"
                                >
                                    <span>{label}</span>
                                    <span className="bg-slate-950 px-2 py-0.5 rounded text-indigo-300">{sampleCounts[index]}</span>
                                </button>
                            ))}
                        </div>
                        <button 
                            onClick={executeLocalTraining}
                            disabled={sampleCounts.reduce((a, b) => a + b, 0) === 0}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 rounded text-sm font-bold shadow-lg transition"
                        >
                            Train & Dispatch Weights
                        </button>
                    </div>
                </aside>
            </div>
        </main>
    );
}