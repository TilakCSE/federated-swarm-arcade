// client/src/components/game/GameCanvas.tsx
'use client';
import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';

// ==========================================
// CONSTANTS & TYPES
// ==========================================
const CONFIG = {
    playerSpeed: 8,
    laserSpeed: 15,
    enemyMinSpeed: 2,
    enemyMaxSpeed: 5,
    fireCooldown: 0.3,
    hitRadiusSq: 0.6, // Squared distance for collision
    bounds: { x: 5, yTop: 6, yBottom: -6, laserMaxY: 10 }
};

interface LaserData {
    x: number;
    y: number;
    active: boolean;
}

interface HitState {
    playerX: number;
    lasers: LaserData[];
    score: number;
    scoreElement: HTMLSpanElement | null;
}

interface SharedProps {
    currentGesture: string;
    isTraining: boolean;
    hitState: React.MutableRefObject<HitState>;
}

// ==========================================
// 3D ENTITIES
// ==========================================

function Player({ currentGesture, isTraining, hitState }: SharedProps) {
    // Proper typing for R3F refs
    const playerRef = useRef<THREE.Mesh>(null!);
    
    // Pre-allocate vectors to avoid garbage collection stutter
    const targetScaleAttack = new THREE.Vector3(1.5, 1.5, 1.5);
    const targetScaleNormal = new THREE.Vector3(1, 1, 1);

    useFrame((_, delta) => {
        if (!playerRef.current || isTraining) return;

        // 1. Movement Logic
        if (currentGesture === 'Move Left') {
            playerRef.current.position.x -= CONFIG.playerSpeed * delta;
        } else if (currentGesture === 'Move Right') {
            playerRef.current.position.x += CONFIG.playerSpeed * delta;
        }

        // Clamp to screen edges
        playerRef.current.position.x = THREE.MathUtils.clamp(
            playerRef.current.position.x, 
            -CONFIG.bounds.x, 
            CONFIG.bounds.x
        );
        
        // Broadcast X position to the shared state for the lasers
        hitState.current.playerX = playerRef.current.position.x;

        // 2. Visual Feedback Logic
        const material = playerRef.current.material as THREE.MeshStandardMaterial;
        
        if (currentGesture === 'Attack') {
            playerRef.current.scale.lerp(targetScaleAttack, 0.2);
            material.color.setHex(0xef4444); // Red
        } else {
            playerRef.current.scale.lerp(targetScaleNormal, 0.2);
            material.color.setHex(0x10b981); // Emerald
        }
    });

    return (
        <mesh ref={playerRef} position={[0, -3.5, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#10b981" roughness={0.2} metalness={0.8} />
        </mesh>
    );
}

function Lasers({ currentGesture, isTraining, hitState }: SharedProps) {
    const lasersRef = useRef<THREE.InstancedMesh>(null!);
    const lastFireTime = useRef(0);
    const dummyMatrix = new THREE.Object3D();

    useFrame((state, delta) => {
        if (isTraining || !lasersRef.current) return;

        const lasers = hitState.current.lasers;

        // 1. Firing Logic
        if (currentGesture === 'Attack' && state.clock.elapsedTime - lastFireTime.current > CONFIG.fireCooldown) {
            const inactiveIndex = lasers.findIndex(l => !l.active);
            if (inactiveIndex !== -1) {
                lasers[inactiveIndex] = { x: hitState.current.playerX, y: -3, active: true };
                lastFireTime.current = state.clock.elapsedTime;
            }
        }

        // 2. Projectile Movement & Cleanup
        lasers.forEach((laser, i) => {
            if (laser.active) {
                laser.y += CONFIG.laserSpeed * delta;
                
                // Deactivate if off-screen
                if (laser.y > CONFIG.bounds.laserMaxY) {
                    laser.active = false;
                }

                dummyMatrix.position.set(laser.x, laser.y, 0.5);
            } else {
                dummyMatrix.position.set(0, -20, 0); // Hide below camera
            }
            
            dummyMatrix.updateMatrix();
            lasersRef.current.setMatrixAt(i, dummyMatrix.matrix);
        });
        
        lasersRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={lasersRef} args={[undefined, undefined, 10]}>
            <cylinderGeometry args={[0.15, 0.15, 1.5, 8]} />
            <meshBasicMaterial color="#ef4444" />
        </instancedMesh>
    );
}

interface EnemyProps extends SharedProps {
    initialPosition: [number, number, number];
    speed: number;
}

function FallingObject({ initialPosition, speed, isTraining, hitState }: EnemyProps) {
    const meshRef = useRef<THREE.Mesh>(null!);

    useFrame((_, delta) => {
        if (isTraining || !meshRef.current) return;

        const mesh = meshRef.current;

        // 1. Gravity & Rotation
        mesh.position.y -= speed * delta;
        mesh.rotation.x += delta * 0.5;
        mesh.rotation.y += delta * 0.5;

        // 2. Screen Wrapping
        if (mesh.position.y < CONFIG.bounds.yBottom) {
            mesh.position.y = CONFIG.bounds.yTop;
            mesh.position.x = (Math.random() - 0.5) * (CONFIG.bounds.x * 2);
        }

        // 3. Collision Detection (against all active lasers)
        hitState.current.lasers.forEach((laser) => {
            if (!laser.active) return;

            const dx = mesh.position.x - laser.x;
            const dy = mesh.position.y - laser.y;
            const distanceSq = (dx * dx) + (dy * dy);

            // Hit confirmed!
            if (distanceSq < CONFIG.hitRadiusSq) {
                // Reset enemy
                mesh.position.y = CONFIG.bounds.yTop;
                mesh.position.x = (Math.random() - 0.5) * (CONFIG.bounds.x * 2);
                
                // Destroy laser
                laser.active = false;
                
                // Update DOM Score directly (bypasses React render cycle)
                hitState.current.score += 10;
                if (hitState.current.scoreElement) {
                    hitState.current.scoreElement.innerText = hitState.current.score.toString();
                }
            }
        });
    });

    return (
        <mesh ref={meshRef} position={initialPosition}>
            <octahedronGeometry args={[0.5]} />
            <meshStandardMaterial color="#6366f1" roughness={0.1} metalness={0.9} />
        </mesh>
    );
}

// ==========================================
// MAIN CANVAS COMPONENT
// ==========================================

interface GameCanvasProps {
    currentGesture: string;
    isTraining: boolean;
    onSessionEnd: (score: number) => void;
}

export default function GameCanvas({ currentGesture, isTraining, onSessionEnd }: GameCanvasProps) {
    const scoreSpanRef = useRef<HTMLSpanElement>(null);
    
    // Central nervous system for physics interactions
    const hitState = useRef<HitState>({
        playerX: 0,
        lasers: Array(10).fill({ x: 0, y: 0, active: false }),
        score: 0,
        scoreElement: null
    });

    useEffect(() => {
        hitState.current.scoreElement = scoreSpanRef.current;
    }, []);

    // Initialize enemy pool once on mount
    const [enemies] = useState(() => 
        Array.from({ length: 8 }).map(() => ({
            position: [
                (Math.random() - 0.5) * (CONFIG.bounds.x * 2), 
                Math.random() * 5 + 3, 
                0
            ] as [number, number, number],
            speed: Math.random() * (CONFIG.enemyMaxSpeed - CONFIG.enemyMinSpeed) + CONFIG.enemyMinSpeed
        }))
    );

    const handleEndSession = () => {
        if (hitState.current.score === 0) return;
        
        onSessionEnd(hitState.current.score);
        
        // Reset locally
        hitState.current.score = 0;
        if (hitState.current.scoreElement) {
            hitState.current.scoreElement.innerText = "0";
        }
    };

    return (
        <div className="w-full h-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-700 relative shadow-inner">
            
            {/* 2D HTML HUD */}
            <div className="absolute top-6 left-0 right-0 z-10 flex flex-col items-center pointer-events-none select-none">
                <p className="text-slate-400 font-mono text-lg font-bold tracking-widest drop-shadow-md">
                    {`SYS.COMMAND: [${currentGesture.toUpperCase()}]`}
                </p>
                
                <p className="text-indigo-400 font-mono text-3xl font-black mt-1 drop-shadow-lg transition-all">
                    SCORE: <span ref={scoreSpanRef}>0</span>
                </p>

                <button 
                    onClick={handleEndSession}
                    className="mt-6 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-full text-sm font-bold shadow-lg transition-all pointer-events-auto border border-indigo-400/50 hover:scale-105"
                >
                    End Session & Bank Points
                </button>

                {isTraining && (
                    <div className="mt-8 px-6 py-2 bg-amber-500/20 border border-amber-500/50 backdrop-blur-sm rounded-lg animate-pulse">
                        <p className="text-amber-400 font-mono text-lg font-black tracking-wide">
                            TRAINING OVERRIDE IN PROGRESS...
                        </p>
                    </div>
                )}
            </div>

            {/* 3D WebGL Context */}
            <Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
                <ambientLight intensity={0.4} />
                <directionalLight position={[5, 10, 5]} intensity={2} />
                <Environment preset="city" />

                <Player 
                    currentGesture={currentGesture} 
                    isTraining={isTraining} 
                    hitState={hitState} 
                />
                
                <Lasers 
                    currentGesture={currentGesture} 
                    isTraining={isTraining} 
                    hitState={hitState} 
                />

                {enemies.map((enemy, i) => (
                    <FallingObject 
                        key={i} 
                        initialPosition={enemy.position} 
                        speed={enemy.speed} 
                        isTraining={isTraining} 
                        hitState={hitState} 
                        currentGesture={currentGesture}
                    />
                ))}
            </Canvas>
        </div>
    );
}