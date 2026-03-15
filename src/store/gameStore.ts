// src/store/gameStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Room, User } from '../types/game';

interface GameState {
    currentUser: User | null;
    currentRoom: Room | null;
    setCurrentUser: (user: User | null) => void;
    setCurrentRoom: (room: Room | null) => void;
}

// persist 미들웨어를 감싸서 localStorage에 데이터를 보존합니다.
export const useGameStore = create<GameState>()(
    persist(
        (set) => ({
            currentUser: null,
            currentRoom: null,
            setCurrentUser: (user) => set({ currentUser: user }),
            setCurrentRoom: (room) => set({ currentRoom: room }),
        }),
        {
            name: 'blackjack-storage', // 로컬 스토리지 키 이름
        }
    )
);
