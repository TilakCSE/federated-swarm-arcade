// client/src/lib/useFederatedSocket.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useFederatedSocket(onGlobalModelReceived: (weights: any) => void) {
    const [socket, setSocket] = useState<any>(null);
    const [swarmPoints, setSwarmPoints] = useState(0);

    useEffect(() => {
        const socketInstance = io('http://localhost:8080');

        socketInstance.on('connect', () => {
            console.log('Connected to Parameter Server via WebSockets');
        });

        socketInstance.on('global_model_dispatch', async (weights) => {
            await onGlobalModelReceived(weights);
        });
        
        // NEW: Listen for swarm point updates
        socketInstance.on('swarm_points_update', (points: number) => {
            setSwarmPoints(points);
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    // NEW: Function to send the final score to the server
    const submitScore = (score: number) => {
        if (socket) socket.emit('submit_score', score);
    };

    return { socket, swarmPoints, submitScore };
}