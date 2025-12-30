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

  constructor() {
    this.nodes = [];
  }

  // New method for Initial Sync
  load(state: { nodes: RgaNode[] }) {
    this.nodes = state.nodes;
  }

  toString(): string {
    return this.nodes
      .filter((n) => n.visible)
      .map((n) => n.value)
      .join("");
  }

  // New method for handling Deletions
  delete(targetId: OpId) {
    const node = this.nodes.find(
      n => n.id.client_id === targetId.client_id && n.id.seq === targetId.seq
    );
    if (node) {
      node.visible = false;
    }
  }

  insert(newNode: RgaNode) {
    if (this.nodes.some(n => n.id.client_id === newNode.id.client_id && n.id.seq === newNode.id.seq)) {
        return; 
    }

    let insertIndex = 0;

    if (newNode.origin) {
      const originIdx = this.nodes.findIndex(
        (n) =>
          n.id.client_id === newNode.origin!.client_id &&
          n.id.seq === newNode.origin!.seq
      );
      if (originIdx === -1) {
        console.error("Origin missing for node", newNode);
        return; 
      }
      insertIndex = originIdx + 1;
    }

    while (insertIndex < this.nodes.length) {
      const nextNode = this.nodes[insertIndex];
      
      const nextOriginMatches = 
        (nextNode.origin === null && newNode.origin === null) ||
        (nextNode.origin && newNode.origin && 
         nextNode.origin.client_id === newNode.origin.client_id && 
         nextNode.origin.seq === newNode.origin.seq);

      if (nextOriginMatches && compareIds(nextNode.id, newNode.id) > 0) {
        insertIndex++;
      } else {
        break;
      }
    }

    this.nodes.splice(insertIndex, 0, newNode);
  }
}