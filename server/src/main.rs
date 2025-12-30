mod crdt;
mod state;

use axum::{
    extract::{Path, State, WebSocketUpgrade, ws::{Message, WebSocket}},
    response::IntoResponse,
    routing::get,
    Router,
};
use dashmap::DashMap;
use futures::{sink::SinkExt, stream::StreamExt};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, oneshot};
use crate::state::{DocumentCommand, DocumentActor, ClientMessage};

struct AppState {
    doc_handles: DashMap<String, DocumentHandle>,
    redis_client: redis::Client,
}

#[derive(Clone)]
struct DocumentHandle {
    sender: mpsc::Sender<DocumentCommand>,
    broadcast_tx: broadcast::Sender<String>,
}

#[tokio::main]
async fn main() {
    // Docker-friendly Redis URL
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = redis::Client::open(redis_url).expect("Failed to create Redis client");

    let state = Arc::new(AppState {
        doc_handles: DashMap::new(),
        redis_client,
    });

    let app = Router::new()
        .route("/ws/:doc_id", get(ws_handler))
        .with_state(state);

    println!("Listening on 0.0.0.0:3000");
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(doc_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, doc_id, state))
}

async fn handle_socket(socket: WebSocket, doc_id: String, state: Arc<AppState>) {
    let handle = state.doc_handles.entry(doc_id.clone()).or_insert_with(|| {
        let (tx, rx) = mpsc::channel(100);
        let (btx, _) = broadcast::channel(100);
        let btx_clone = btx.clone();
        let redis_client = state.redis_client.clone();
        let doc_id_clone = doc_id.clone();
        
        // Pass a clone of tx to the actor so it can self-message from Redis
        let tx_for_actor = tx.clone(); 

        tokio::spawn(async move {
            // Updated constructor call
            let mut actor = DocumentActor::new(rx, btx_clone, redis_client, doc_id_clone, tx_for_actor);
            actor.run().await;
        });

        DocumentHandle { sender: tx, broadcast_tx: btx }
    }).clone();

    let (mut sender, mut receiver) = socket.split();
    let mut broadcast_rx = handle.broadcast_tx.subscribe();

    // 1. Initial Sync
    let (resp_tx, resp_rx) = oneshot::channel();
    let _ = handle.sender.send(DocumentCommand::Join { 
        _client_id: 0, 
        response: resp_tx 
    }).await;

    if let Ok(initial_state) = resp_rx.await {
        let _ = sender.send(Message::Text(format!("INIT:{}", initial_state))).await;
    }

    // 2. Broadcast -> WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg_json) = broadcast_rx.recv().await {
            if sender.send(Message::Text(msg_json)).await.is_err() { break; }
        }
    });

    // 3. WebSocket -> Actor
    let tx_handle = handle.sender.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            if let Ok(msg) = serde_json::from_str::<ClientMessage>(&text) {
                // Wrap in ClientMessage variant
                let _ = tx_handle.send(DocumentCommand::ClientMessage { msg }).await;
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };
}