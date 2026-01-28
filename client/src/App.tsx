import { useState, useRef, useEffect, useCallback } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useParams } from 'react-router-dom';
import Editor, { OnMount } from "@monaco-editor/react";
import * as monaco from 'monaco-editor';
import { Rga, type RgaNode, type OpId } from './crdt';
import { generateIdentity, type UserIdentity } from './identity';

const CLIENT_ID = Math.floor(Math.random() * 1000000);
const MY_IDENTITY = generateIdentity(CLIENT_ID);

const LANGUAGES = [
    'javascript', 'typescript', 'python', 'java', 'c', 'cpp', 'csharp',
    'rust', 'go', 'html', 'css', 'sql', 'json', 'markdown', 'yaml'
];

type WsMessage =
    | { type: 'insert'; node: RgaNode }
    | { type: 'delete'; id: OpId }
    | { type: 'cursor'; client_id: number; index: number; name: string; color: string }
    | { type: 'language'; name: string }; // NEW

function CollabEditor() {
    const { docId } = useParams();
    const [remoteCursors, setRemoteCursors] = useState<Record<number, { index: number, identity: UserIdentity }>>({});
    const [language, setLanguage] = useState("javascript"); // Track current language

    const rga = useRef(new Rga());
    const seq = useRef(0);
    const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const decorationsRef = useRef<string[]>([]);
    const isRemoteUpdate = useRef(false);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_URL
        ? `${import.meta.env.VITE_WS_URL}/${docId}`
        : `${protocol}//${window.location.hostname}:3000/ws/${docId}`;

    const { sendMessage, lastMessage, readyState } = useWebSocket(docId ? host : null, {
        shouldReconnect: () => true,
    });

    // 1. Handle Messages
    useEffect(() => {
        if (lastMessage !== null && editorRef.current) {
            const data = lastMessage.data;
            const model = editorRef.current.getModel();
            if (!model) return;

            // INIT
            if (typeof data === 'string' && data.startsWith("INIT:")) {
                const jsonStr = data.substring(5);
                try {
                    const remoteState = JSON.parse(jsonStr);
                    rga.current.load(remoteState);

                    // Set Language from Server
                    if (remoteState.language) {
                        setLanguage(remoteState.language);
                    }

                    isRemoteUpdate.current = true;
                    editorRef.current.setValue(rga.current.toString());
                    isRemoteUpdate.current = false;

                    const maxSeq = remoteState.nodes.reduce((max: number, n: RgaNode) => {
                        return (n.id.client_id === CLIENT_ID && n.id.seq > max) ? n.id.seq : max;
                    }, 0);
                    seq.current = maxSeq;
                } catch (e) { }
                return;
            }

            // UPDATES
            try {
                const msg: WsMessage = JSON.parse(data);

                if ('client_id' in msg && msg.client_id === CLIENT_ID) {
                    return; // Ignore my own echoed messages
                }
                if (msg.type === 'insert' && msg.node.id.client_id === CLIENT_ID) {
                    return; // Double safety for inserts
                }
                if (msg.type === 'language') {
                    setLanguage(msg.name);
                } else if (msg.type === 'insert') {
                    rga.current.insert(msg.node);
                    const visibleNodes = rga.current.nodes.filter(n => n.visible);
                    const insertIndex = visibleNodes.findIndex(n =>
                        n.id.client_id === msg.node.id.client_id && n.id.seq === msg.node.id.seq
                    );
                    if (insertIndex !== -1) {
                        const pos = model.getPositionAt(insertIndex);
                        isRemoteUpdate.current = true;
                        model.applyEdits([{
                            range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                            text: msg.node.value,
                            forceMoveMarkers: true
                        }]);
                        isRemoteUpdate.current = false;
                    }
                } else if (msg.type === 'delete') {
                    const visibleNodes = rga.current.nodes.filter(n => n.visible);
                    const deleteIndex = visibleNodes.findIndex(n =>
                        n.id.client_id === msg.id.client_id && n.id.seq === msg.id.seq
                    );
                    if (deleteIndex !== -1) {
                        rga.current.delete(msg.id);
                        const startPos = model.getPositionAt(deleteIndex);
                        const endPos = model.getPositionAt(deleteIndex + 1);
                        isRemoteUpdate.current = true;
                        model.applyEdits([{
                            range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                            text: "",
                        }]);
                        isRemoteUpdate.current = false;
                    }
                } else if (msg.type === 'cursor') {
                    setRemoteCursors(prev => ({
                        ...prev,
                        [msg.client_id]: {
                            index: msg.index,
                            identity: { name: msg.name, color: msg.color }
                        }
                    }));
                }
            } catch (e) { console.error(e); }
        }
    }, [lastMessage]);

    // 2. Handle Language Change (Local)
    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang = e.target.value;
        setLanguage(newLang);
        // Broadcast to others
        sendMessage(JSON.stringify({ type: 'language', name: newLang }));
    };

    // ... (Keep handleEditorChange, decorations, styles, mount logic same as before) ...
    // [PASTE PREVIOUS LOGIC FOR DECORATIONS, STYLES, ONCHANGE, MOUNT HERE]
    // For brevity, I am assuming you kept the helper functions from Phase 7/8.

    // Re-declare them here if you need full copy-paste safety:
    useEffect(() => {
        if (!editorRef.current) return;
        const model = editorRef.current.getModel();
        if (!model) return;
        const newDecorations: monaco.editor.IModelDeltaDecoration[] = Object.entries(remoteCursors).map(([cid, data]) => {
            const maxLen = model.getValueLength();
            const safeIndex = Math.min(data.index, maxLen);
            const pos = model.getPositionAt(safeIndex);
            return {
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                options: {
                    className: `remote-cursor-${cid}`,
                    hoverMessage: { value: `**${data.identity.name}**` },
                    overviewRuler: { position: monaco.editor.OverviewRulerLane.Right, color: data.identity.color }
                }
            };
        });
        decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, newDecorations);
    }, [remoteCursors]);

    useEffect(() => {
        const styleId = 'remote-cursor-styles';
        let styleTag = document.getElementById(styleId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            document.head.appendChild(styleTag);
        }
        const cssRules = Object.entries(remoteCursors).map(([cid, data]) => `
        .remote-cursor-${cid} {
            border-left: 2px solid ${data.identity.color};
            background-color: ${data.identity.color}20;
        }
    `).join('\n');
        styleTag.textContent = cssRules;
    }, [remoteCursors]);

    const handleEditorChange = useCallback((value: string | undefined, ev: monaco.editor.IModelContentChangedEvent) => {
        if (isRemoteUpdate.current) return;
        ev.changes.forEach(change => {
            if (change.rangeLength > 0) {
                const deleteIndex = change.rangeOffset;
                const visibleNodes = rga.current.nodes.filter(n => n.visible);
                const nodesToDelete = [];
                for (let i = 0; i < change.rangeLength; i++) {
                    if (visibleNodes[deleteIndex + i]) nodesToDelete.push(visibleNodes[deleteIndex + i]);
                }
                nodesToDelete.forEach(node => {
                    rga.current.delete(node.id);
                    sendMessage(JSON.stringify({ type: 'delete', id: node.id }));
                });
            }
            if (change.text.length > 0) {
                const insertIndex = change.rangeOffset;
                const visibleNodes = rga.current.nodes.filter(n => n.visible);
                let originNode = insertIndex > 0 ? visibleNodes[insertIndex - 1] : null;
                for (let i = 0; i < change.text.length; i++) {
                    const char = change.text[i];
                    const origin = originNode ? originNode.id : null;
                    seq.current += 1;
                    const newNode: RgaNode = {
                        id: { client_id: CLIENT_ID, seq: seq.current },
                        origin: origin,
                        value: char,
                        visible: true,
                    };
                    rga.current.insert(newNode);
                    sendMessage(JSON.stringify({ type: 'insert', node: newNode }));
                    originNode = newNode;
                }
            }
        });
    }, [sendMessage]);

    const handleEditorDidMount: OnMount = (editor) => {
        editorRef.current = editor;
        editor.focus();
        editor.onDidChangeCursorPosition((e) => {
            if (readyState === ReadyState.OPEN) {
                const model = editor.getModel();
                if (model) {
                    const offset = model.getOffsetAt(e.position);
                    sendMessage(JSON.stringify({
                        type: 'cursor', client_id: CLIENT_ID, index: offset,
                        name: MY_IDENTITY.name, color: MY_IDENTITY.color
                    }));
                }
            }
        });
    };

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
            {/* Header Bar */}
            <div style={{
                padding: '10px 20px', background: '#1e1e1e', color: '#fff',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid #333'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2 style={{ margin: 0, fontSize: '1rem' }}>📄 {docId?.substring(0, 8)}...</h2>

                    {/* LANGUAGE SELECTOR */}
                    <select
                        value={language}
                        onChange={handleLanguageChange}
                        style={{
                            background: '#333', color: 'white', border: '1px solid #555',
                            padding: '4px 8px', borderRadius: '4px', cursor: 'pointer'
                        }}
                    >
                        {LANGUAGES.map(lang => (
                            <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                        ))}
                    </select>

                    <span style={{
                        fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px',
                        background: readyState === ReadyState.OPEN ? '#27ae60' : '#c0392b'
                    }}>
                        {readyState === ReadyState.OPEN ? 'Online' : 'Offline'}
                    </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{
                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                        border: `1px solid ${MY_IDENTITY.color}`, color: MY_IDENTITY.color, fontWeight: 'bold'
                    }}>
                        You: {MY_IDENTITY.name}
                    </div>
                    {Object.entries(remoteCursors).map(([cid, data]) => (
                        <div key={cid} style={{
                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                            background: data.identity.color, color: '#fff', fontWeight: 'bold'
                        }}>
                            {data.identity.name}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1 }}>
                <Editor
                    height="100%"
                    language={language} // <--- Dynamic Language Prop
                    theme="vs-dark"
                    onChange={handleEditorChange}
                    onMount={handleEditorDidMount}
                    options={{ minimap: { enabled: true }, fontSize: 14 }}
                />
            </div>
        </div>
    );
}

export default CollabEditor;