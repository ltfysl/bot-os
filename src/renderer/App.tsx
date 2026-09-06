import { useState, useEffect, useCallback } from 'react';
import ChatView from './components/ChatView';
import RoomView from './components/RoomView';
import Sidebar from './components/Sidebar';
import RoutinesView from './components/RoutinesView';
import type { Agent, Room } from './types';

type ViewMode = 'chat' | 'routines' | 'room';

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('1');
  const [activeRoomId, setActiveRoomId] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  const loadAgents = useCallback(async () => {
    const agentsData = await window.electronAPI.getAgents();
    setAgents(agentsData);
  }, []);

  const loadRooms = useCallback(async () => {
    const roomsData = await window.electronAPI.listRooms();
    setRooms(roomsData);
  }, []);

  useEffect(() => {
    loadAgents();
    loadRooms();
  }, [loadAgents, loadRooms]);

  const activeAgent = agents.find((a) => a.id === activeAgentId);
  const activeRoom = activeRoomId ? rooms.find((r) => r.id === activeRoomId) : undefined;

  return (
    <div className="app">
      <Sidebar
        agents={agents}
        rooms={rooms}
        activeAgentId={activeAgentId}
        activeRoomId={activeRoomId}
        onAgentSelect={(id) => {
          setActiveAgentId(id);
          setViewMode('chat');
        }}
        onRoomSelect={(id) => {
          setActiveRoomId(id);
          setViewMode('room');
        }}
        viewMode={viewMode}
        onRoutinesClick={() => setViewMode('routines')}
      />
      <div style={{ display: viewMode === 'chat' ? 'flex' : 'none', flex: 1, minWidth: 0 }}>
        <ChatView agent={activeAgent} onAgentsChange={loadAgents} />
      </div>
      <div style={{ display: viewMode === 'room' ? 'flex' : 'none', flex: 1, minWidth: 0 }}>
        {activeRoom && (
          <RoomView room={activeRoom} agents={agents} onRoomUpdate={loadRooms} />
        )}
      </div>
      {viewMode === 'routines' && (
        <RoutinesView onClose={() => setViewMode('chat')} />
      )}
    </div>
  );
}

export default App;
