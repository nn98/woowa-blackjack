// src/App.tsx
import { useEffect, useState } from 'react';
import { initGameDatabase } from './services/firebaseRoom';
import { useGameStore } from './store/gameStore';
import Lobby from './components/Lobby/Lobby';
import Room from './components/Room/Room'; // 새로 만든 방 컴포넌트 불러오기

function App() {
    const [isDbReady, setIsDbReady] = useState(false);
    const currentRoom = useGameStore((state) => state.currentRoom);

    useEffect(() => {
        const setupDB = async () => {
            await initGameDatabase();
            setIsDbReady(true);
        };
        setupDB();
    }, []);

    if (!isDbReady) {
        return <div style={{ padding: '20px', textAlign: 'center' }}>DB 세팅 및 연결 중...</div>;
    }

    return (
        <div style={{ backgroundColor: '#ecf0f1', minHeight: '100vh', padding: '1px' }}>
            {/* 전역 상태에 방 정보가 있으면 인게임 화면을, 없으면 로비 화면을 보여줍니다. */}
            {currentRoom ? <Room /> : <Lobby />}
        </div>
    );
}

export default App;
