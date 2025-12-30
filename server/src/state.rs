use crate::crdt::{Node, Rga, OpId};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio::time::{self, Duration};
use futures::StreamExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum ClientMessage {
    #[serde(rename = "insert")]
    Insert { node: Node },
    #[serde(rename = "delete")]
    Delete { id: OpId },
    #[serde(rename = "cursor")]
    Cursor { 
        client_id: u64, 
        index: usize,
        name: String,   // Added Identity Name
        color: String   // Added Identity Color
    },
    #[serde(rename = "language")]
    Language { name: String }, // <--- NEW MESSAGE TYPE
}

#[derive(Debug)]
pub enum DocumentCommand {
    Join {
        _client_id: u64,
        response: oneshot::Sender<String>, 
    },
    ClientMessage {
        msg: ClientMessage,
    },
    RemoteMessage {
        msg: ClientMessage,
    }
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
        doc_id: String,
        self_sender: mpsc::Sender<DocumentCommand> 
    ) -> Self {
        
        let redis_clone = redis.clone();
        let doc_id_clone = doc_id.clone();
        let sender_clone = self_sender.clone();
        
        // Spawn Redis Subscriber
        tokio::spawn(async move {
            let mut conn = match redis_clone.get_async_connection().await {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("PubSub connect error: {}", e);
                    return;
                }
            };
            let mut pubsub = conn.into_pubsub();
            let channel = format!("updates:doc:{}", doc_id_clone);
            
            if let Err(e) = pubsub.subscribe(&channel).await {
                 eprintln!("Failed to subscribe: {}", e);
                 return;
            }

            let mut stream = pubsub.on_message();
            while let Some(msg) = stream.next().await {
                if let Ok(payload_str) = msg.get_payload::<String>() {
                    if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&payload_str) {
                        let _ = sender_clone.send(DocumentCommand::RemoteMessage { msg: client_msg }).await;
                    }
                }
            }
        });

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
        let mut conn = match self.redis.get_async_connection().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Redis connect error: {}", e);
                return;
            }
        };

        let key = format!("doc:{}", self.doc_id);
        let pub_channel = format!("updates:doc:{}", self.doc_id);
        
        if let Ok(json) = conn.get::<_, String>(&key).await {
            if let Ok(loaded_doc) = serde_json::from_str::<Rga>(&json) {
                self.doc = loaded_doc;
                println!("Loaded {} from Redis", self.doc_id);
            }
        }

        let mut save_interval = time::interval(Duration::from_secs(2));

        loop {
            tokio::select! {
                Some(cmd) = self.receiver.recv() => {
                    match cmd {
                        DocumentCommand::Join { response, .. } => {
                            let json = serde_json::to_string(&self.doc).unwrap_or_default();
                            let _ = response.send(json);
                        }

                        DocumentCommand::ClientMessage { msg } => {
                            let mut should_broadcast = false;
                            
                            match &msg {
                                ClientMessage::Insert { node } => {
                                     if !self.doc.contains(node.id) {
                                        self.doc.insert(node.clone());
                                        self.dirty = true;
                                        should_broadcast = true;
                                     }
                                }
                                ClientMessage::Delete { id } => {
                                    self.doc.delete(*id);
                                    self.dirty = true;
                                    should_broadcast = true;
                                }
                                ClientMessage::Cursor { .. } => {
                                    should_broadcast = true;
                                }
                                ClientMessage::Language { name } => {
                                    // Handle Language Change Locally
                                    self.doc.language = name.clone();
                                    self.dirty = true;
                                    should_broadcast = true;
                                }
                            }

                            if should_broadcast {
                                if let Ok(json) = serde_json::to_string(&msg) {
                                    let _ = self.broadcaster.send(json.clone());
                                    let _: Result<(), _> = conn.publish(&pub_channel, json).await;
                                }
                            }
                        }

                        DocumentCommand::RemoteMessage { msg } => {
                            let mut is_new_info = false;
                            
                            match &msg {
                                ClientMessage::Insert { node } => {
                                    if !self.doc.contains(node.id) {
                                        self.doc.insert(node.clone());
                                        self.dirty = true;
                                        is_new_info = true;
                                    }
                                }
                                ClientMessage::Delete { id } => {
                                    self.doc.delete(*id);
                                    self.dirty = true;
                                    is_new_info = true;
                                }
                                ClientMessage::Cursor { .. } => {
                                    is_new_info = true;
                                }
                                ClientMessage::Language { name } => {
                                    // Handle Remote Language Change
                                    self.doc.language = name.clone();
                                    self.dirty = true;
                                    is_new_info = true;
                                }
                            }

                            if is_new_info {
                                if let Ok(json) = serde_json::to_string(&msg) {
                                    let _ = self.broadcaster.send(json);
                                }
                            }
                        }
                    }
                }

                _ = save_interval.tick() => {
                    if self.dirty {
                        if let Ok(json) = serde_json::to_string(&self.doc) {
                            let _: Result<(), _> = conn.set(&key, json).await;
                            println!("Saved snapshot for {}", self.doc_id);
                            self.dirty = false;
                        }
                    }
                }
            }
        }
    }
}