// src/types/game.ts
export type Suit = 'spade' | 'heart' | 'diamond' | 'club';
export type CardValue = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
    suit: Suit;
    value: CardValue;
    score: number;
}

export type RoomStatus = 'WAITING' | 'BETTING' | 'PRE_DECISION' | 'PLAYING' | 'DEALER_TURN' | 'RESULT';

// DECIDING(진행/포기 결정 중), CONTINUE(진행 확정) 추가
export type PlayerStatus = 'READY' | 'DECIDING' | 'CONTINUE' | 'SURRENDER' | 'PLAYING' | 'STAND' | 'BUST' | 'SPECTATING';

export interface Player {
    nickname: string;
    credit: number;
    betAmount: number;
    cards: Card[];
    visibleCards: number;
    status: PlayerStatus;
    score: number;
    isReady: boolean;
}

export interface Dealer {
    cards: Card[];
    score: number;
    isBust: boolean;
}

export interface Room {
    id: string;
    status: RoomStatus;
    hostEmail: string;
    activePlayerEmail?: string; // 현재 턴을 진행 중인 플레이어
    dealer: Dealer;
    players: Record<string, Player>;
    deck: Card[];
}

export interface User {
    email: string;
    nickname: string;
    credit: number;
}