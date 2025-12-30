use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

/// Unique ID for every operation/character
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct OpId {
    pub client_id: u64,
    pub seq: u64,
}

impl PartialOrd for OpId {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for OpId {
    fn cmp(&self, other: &Self) -> Ordering {
        match self.seq.cmp(&other.seq) {
            Ordering::Equal => self.client_id.cmp(&other.client_id),
            other => other,
        }
    }
}

/// A node in our RGA structure (represents one character)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: OpId,
    pub origin: Option<OpId>, 
    pub value: char,
    pub visible: bool, 
}

/// The Document State
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rga {
    pub nodes: Vec<Node>,
    pub language: String, // <--- NEW: Stores the current language mode
}

impl Default for Rga {
    fn default() -> Self {
        Self::new()
    }
}

impl Rga {
    pub fn new() -> Self {
        Self { 
            nodes: Vec::new(),
            language: "javascript".to_string() // Default to JS
        }
    }

    pub fn to_string(&self) -> String {
        self.nodes
            .iter()
            .filter(|n| n.visible)
            .map(|n| n.value)
            .collect()
    }

    // Helper to check if we already have an operation (for idempotency)
    pub fn contains(&self, id: OpId) -> bool {
        self.nodes.iter().any(|n| n.id == id)
    }

    pub fn delete(&mut self, target_id: OpId) {
        if let Some(node) = self.nodes.iter_mut().find(|n| n.id == target_id) {
            node.visible = false;
        }
    }

    pub fn insert(&mut self, new_node: Node) {
        let mut insert_index = match new_node.origin {
            None => 0, 
            Some(origin_id) => {
                match self.nodes.iter().position(|n| n.id == origin_id) {
                    Some(idx) => idx + 1, 
                    None => {
                        eprintln!("Error: Origin node {:?} not found! Dropping op.", origin_id);
                        return;
                    }
                }
            }
        };

        while insert_index < self.nodes.len() {
            let next_node = &self.nodes[insert_index];
            if next_node.origin == new_node.origin && next_node.id > new_node.id {
                insert_index += 1;
            } else {
                break;
            }
        }

        self.nodes.insert(insert_index, new_node);
    }
}