// src/utils/gameLogic.ts
import type { Card } from '../types/game';

export const calculateTotalScore = (cards: Card[]): number => {
    if (!cards || cards.length === 0) return 0;

    let scoreSum = 0;
    let aceCount = 0;

    cards.forEach(card => {
        scoreSum += card.score;
        if (card.value === 'A') aceCount += 1;
    });

    // 에이스가 있을 경우, 10을 더해도 21을 넘지 않는다면 최대한 11(기본1 + 추가10)로 계산
    for (let i = 0; i < aceCount; i++) {
        if (scoreSum + 10 <= 21) {
            scoreSum += 10;
        }
    }

    return scoreSum;
};

export const isBlackjack = (cards: Card[]): boolean => {
    return calculateTotalScore(cards) === 21 && cards.length === 2;
};

export const isBust = (cards: Card[]): boolean => {
    return calculateTotalScore(cards) > 21;
};
