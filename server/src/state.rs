use crate::crdt::{Node, Rga, OpId};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio::time::{self, Duration};

/// The wire format for WebSocket messages
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "insert")]
    Insert { node: Node },
    #[serde(rename = "delete")]
    Delete { id: OpId },
    // NEW: Ephemeral cursor update (not saved to DB)
    #[serde(rename = "cursor")]
    Cursor { client_id: u64, index: usize },
}

#[derive(Debug)]
pub enum DocumentCommand {
    Join {
        _client_id: u64,
        response: oneshot::Sender<String>, 
    },
    Message {
        msg: ClientMessage,
    },
}

pub struct DocumentActor {
    doc: Rga,
    receiver: mpsc::Receiver<DocumentCommand>,
    broadcaster: broadcast::Sender<String>,
    redis: redis::Client,
    doc_id: String,
    dirty: bool,
}

impl DocumentActor {
    pub fn new(
        receiver: mpsc::Receiver<DocumentCommand>, 
        broadcaster: broadcast::Sender<String>,
        redis: redis::Client,
        doc_id: String
    ) -> Self {
        Self {
            doc: Rga::new(),
            receiver,
            broadcaster,
            redis,
            doc_id,
            dirty: false,
        }
    }

    pub async fn run(&mut self) {
        // 1. LOAD FROM REDIS
        let mut conn = match self.redis.get_async_connection().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Redis connection failed: {}", e);
                return;
            }
        };

        let key = format!("doc:{}", self.doc_id);
        let stored_json: Option<String> = conn.get(&key).await.unwrap_or(None);
        if let Some(json) = stored_json {
            if let Ok(loaded_doc) = serde_json::from_str::<Rga>(&json) {
                println!("Loaded document {} from Redis.", self.doc_id);
                self.doc = loaded_doc;
            }
        }

        let mut save_interval = time::interval(Duration::from_secs(2));

        // 2. MAIN LOOP
        loop {
            tokio::select! {
                Some(cmd) = self.receiver.recv() => {
                    match cmd {
                        DocumentCommand::Join { response, .. } => {
                            // Send full state on join
                            let json = serde_json::to_string(&self.doc).unwrap_or_default();
                            let _ = response.send(json);
                        }
                        DocumentCommand::Message { msg } => {
                            // Apply to local state & set dirty flag ONLY for persistent ops
                            match &msg {
                                ClientMessage::Insert { node } => {
                                    self.doc.insert(node.clone());
                                    self.dirty = true;
                                }
                                ClientMessage::Delete { id } => {
                                    self.doc.delete(*id);
                                    self.dirty = true;
                                }
                                ClientMessage::Cursor { .. } => {
                                    // Do NOT set dirty = true
                                    // We just broadcast this; we don't save it.
                                }
                            }
                            
                            // Broadcast to other clients
                            if let Ok(json) = serde_json::to_string(&msg) {
                                let _ = self.broadcaster.send(json);
                            }
                        }
                    }
                }

                _ = save_interval.tick() => {
                    if self.dirty {
                        // Snapshot Strategy: Save the whole state
                        if let Ok(json) = serde_json::to_string(&self.doc) {
                            let _: Result<(), _> = conn.set(&key, json).await;
                            println!("Saved {} to Redis.", self.doc_id);
                            self.dirty = false;
                        }
                    }
                }
            }
        }
    }
}