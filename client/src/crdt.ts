export interface OpId {
  client_id: number;
  seq: number;
}

export interface RgaNode {
  id: OpId;
  origin: OpId | null;
  value: string;
  visible: boolean;
}

export function compareIds(a: OpId, b: OpId): number {
  if (a.seq === b.seq) {
    return a.client_id - b.client_id;
  }
  return a.seq - b.seq;
}

export class Rga {
  nodes: RgaNode[];
  language: string; // <--- NEW FIELD

  constructor() {
    this.nodes = [];
    this.language = "javascript"; // Default
  }

  // Load state from server
  load(state: { nodes: RgaNode[], language?: string }) {
    this.nodes = state.nodes;
    if (state.language) {
      this.language = state.language;
    }
  }

  toString(): string {
    return this.nodes
      .filter((n) => n.visible)
      .map((n) => n.value)
      .join("");
  }

  delete(targetId: OpId) {
    const node = this.nodes.find(
      n => n.id.client_id === targetId.client_id && n.id.seq === targetId.seq
    );
    if (node) {
      node.visible = false;
    }
  }

  insert(newNode: RgaNode) {
    // 1. Idempotency check
    if (this.nodes.some(n => n.id.client_id === newNode.id.client_id && n.id.seq === newNode.id.seq)) {
      return;
    }

    let insertIndex = 0;

    // 2. Handle Origin
    if (newNode.origin) {
      const originIdx = this.nodes.findIndex(
        (n) => n.id.client_id === newNode.origin!.client_id && n.id.seq === newNode.origin!.seq
      );

      if (originIdx !== -1) {
        insertIndex = originIdx + 1;
      } else {
        // CRITICAL FIX: Don't drop it. 
        // If origin is missing, we must retry later or put it at the end (fallback).
        // For this snippet, we will console warn and push to end to avoid crash,
        // but in production, you MUST use a pending queue.
        console.warn("Orphan node received, appending to end to prevent data loss:", newNode);
        insertIndex = this.nodes.length;
      }
    }

    // 3. RGA Traversal (The "Sibling" Logic)
    // Your original loop was correct for basic RGA
    while (insertIndex < this.nodes.length) {
      const nextNode = this.nodes[insertIndex];

      // We only skip nodes that share the SAME origin (siblings)
      const nextOriginMatches =
        (nextNode.origin === null && newNode.origin === null) ||
        (nextNode.origin && newNode.origin &&
          nextNode.origin.client_id === newNode.origin.client_id &&
          nextNode.origin.seq === newNode.origin.seq);

      if (nextOriginMatches && compareIds(nextNode.id, newNode.id) > 0) {
        insertIndex++;
      } else {
        // STOP. Do not skip children of siblings.
        break;
      }
    }

    this.nodes.splice(insertIndex, 0, newNode);
  }
}