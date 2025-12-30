import { useState, useRef, useEffect } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Rga, type RgaNode, type OpId } from './crdt';

const CLIENT_ID = Math.floor(Math.random() * 1000000);

type WsMessage = 
  | { type: 'insert'; node: RgaNode }
  | { type: 'delete'; id: OpId }
  | { type: 'cursor'; client_id: number; index: number };

function App() {
  const [text, setText] = useState("");
  // Track other users' cursors: { 12345: 10, ... }
  const [cursors, setCursors] = useState<Record<number, number>>({});
  
  const rga = useRef(new Rga());
  const seq = useRef(0);

  // If running in Docker/Localhost, this points to localhost
  const socketUrl = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:3000/ws/demo-doc';
  
  const { sendMessage, lastMessage, readyState } = useWebSocket(socketUrl, {
    shouldReconnect: () => true,
  });

  useEffect(() => {
    if (lastMessage !== null) {
      const data = lastMessage.data;

      if (typeof data === 'string' && data.startsWith("INIT:")) {
        const jsonStr = data.substring(5);
        try {
          const remoteState = JSON.parse(jsonStr);
          rga.current.load(remoteState);
          setText(rga.current.toString());
          
          const maxSeq = remoteState.nodes.reduce((max: number, n: RgaNode) => {
             return (n.id.client_id === CLIENT_ID && n.id.seq > max) ? n.id.seq : max;
          }, 0);
          seq.current = maxSeq;
        } catch (e) {
          console.error("Failed to parse initial state", e);
        }
        return;
      }

      try {
        const msg: WsMessage = JSON.parse(data);
        
        if (msg.type === 'insert') {
            rga.current.insert(msg.node);
            setText(rga.current.toString());
        } else if (msg.type === 'delete') {
            rga.current.delete(msg.id);
            setText(rga.current.toString());
        } else if (msg.type === 'cursor') {
            // Update the specific client's cursor position
            setCursors(prev => ({
                ...prev,
                [msg.client_id]: msg.index
            }));
            // Return early - do not set text!
            return;
        }
      } catch (e) { console.error(e); }
    }
  }, [lastMessage]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const oldText = text;

    if (newText.length > oldText.length) {
      let diffIndex = 0;
      while (diffIndex < oldText.length && newText[diffIndex] === oldText[diffIndex]) {
        diffIndex++;
      }
      
      const charAdded = newText[diffIndex];
      const visibleNodes = rga.current.nodes.filter(n => n.visible);
      const originNode = diffIndex > 0 ? visibleNodes[diffIndex - 1] : null;
      const origin = originNode ? originNode.id : null;

      seq.current += 1;
      
      const newNode: RgaNode = {
        id: { client_id: CLIENT_ID, seq: seq.current },
        origin: origin,
        value: charAdded,
        visible: true,
      };

      rga.current.insert(newNode);
      setText(rga.current.toString());
      
      const msg: WsMessage = { type: 'insert', node: newNode };
      sendMessage(JSON.stringify(msg));

      setTimeout(() => {
          e.target.selectionStart = diffIndex + 1;
          e.target.selectionEnd = diffIndex + 1;
      }, 0);
    } 
    else if (newText.length < oldText.length) {
        let diffIndex = 0;
        while (diffIndex < newText.length && newText[diffIndex] === oldText[diffIndex]) {
            diffIndex++;
        }
        
        const visibleNodes = rga.current.nodes.filter(n => n.visible);
        const nodeToDelete = visibleNodes[diffIndex];

        if (nodeToDelete) {
            rga.current.delete(nodeToDelete.id);
            setText(rga.current.toString());
            
            const msg: WsMessage = { type: 'delete', id: nodeToDelete.id };
            sendMessage(JSON.stringify(msg));
            
            setTimeout(() => {
                e.target.selectionStart = diffIndex;
                e.target.selectionEnd = diffIndex;
            }, 0);
        }
    }
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      // Broadcast cursor position
      const msg = { 
          type: 'cursor', 
          client_id: CLIENT_ID, 
          index: target.selectionStart 
      };
      if (readyState === ReadyState.OPEN) {
          sendMessage(JSON.stringify(msg));
      }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Collaborative Editor</h2>
      
      {/* Active Users Bar */}
      <div style={{ marginBottom: '15px', padding: '10px', background: '#f5f5f5', borderRadius: '8px', border: '1px solid #ddd' }}>
          <strong>Active Cursors:</strong>
          <div style={{ display: 'flex', gap: '10px', marginTop: '5px', flexWrap: 'wrap' }}>
              {Object.entries(cursors).map(([cid, idx]) => (
                  <span key={cid} style={{ 
                      padding: '4px 8px', 
                      background: cid === String(CLIENT_ID) ? '#badc58' : '#7ed6df',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: '#2d3436'
                  }}>
                      {cid === String(CLIENT_ID) ? "You" : `User ${cid}`} : {idx}
                  </span>
              ))}
              {Object.keys(cursors).length === 0 && <span style={{color: '#888', fontStyle: 'italic'}}>No one else is typing...</span>}
          </div>
      </div>

      <textarea
        value={text}
        onChange={handleInput}
        onSelect={handleSelect}
        rows={15}
        style={{ 
            width: '100%', 
            fontSize: '1.2rem', 
            padding: '15px', 
            borderRadius: '8px', 
            border: '1px solid #ccc',
            fontFamily: 'monospace'
        }}
        placeholder="Start typing..."
      />
      <div style={{color: "#aaa", marginTop: "10px", fontSize: '0.8rem'}}>Client ID: {CLIENT_ID}</div>
    </div>
  );
}

export default App;