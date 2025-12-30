# 📝 Rust-Collab: Distributed Real-Time Editor

**A high-performance, conflict-free collaborative code editor built with Rust, WebSockets, and CRDTs.**

## 🚀 Overview

Rust-Collab is a real-time collaborative IDE that allows multiple users to edit code simultaneously without conflicts. Unlike standard text editors that lock documents, this project uses **CRDTs (Conflict-free Replicated Data Types)** to merge edits mathematically, ensuring eventual consistency even under high latency.

It is designed as a **Distributed System**. You can spin up 100 instances of the Rust backend, and users connected to Server #1 can seamlessly collaborate with users on Server #99 via a **Redis Pub/Sub** bus.

## ✨ Key Features

* **⚡ Real-Time Sync:** Character-by-character synchronization using WebSockets.
* **🧠 Conflict-Free (CRDT):** Implements the **RGA (Replicated Growable Array)** algorithm to handle concurrent edits without "locking" the document.
* **🌐 Distributed Architecture:** Stateless backend design using **Redis Pub/Sub** for horizontal scaling across multiple regions/containers.
* **💾 Persistence:** Document state is snapshotted to Redis, ensuring data survives server restarts.
* **🎨 VS Code Experience:** Integrated **Monaco Editor** for syntax highlighting, minimaps, and professional coding experience.
* **🗣️ Multi-Language Support:** First-class support for Rust, Python, JavaScript, Go, C++, and 10+ other languages.
* **👥 User Presence:** Live cursors with identities (names & colors) to track who is typing where.

## 🛠️ Tech Stack

### **Backend (High Performance)**

* **Language:** Rust (v1.75+)
* **Framework:** Axum (Asynchronous WebSockets)
* **Runtime:** Tokio (Multi-threaded async runtime)
* **Database/Bus:** Redis (Persistence & Pub/Sub messaging)

### **Frontend (Responsive UX)**

* **Framework:** React + TypeScript (Vite)
* **Editor Engine:** Monaco Editor (The engine powering VS Code)
* **State Management:** React Refs (Mutable state for 60fps typing performance)
* **Styling:** CSS Modules / Inline Styles

### **DevOps**

* **Containerization:** Docker & Docker Compose
* **Cloud:** Render (Backend), Vercel (Frontend), Upstash (Redis)

---

## 📐 Architecture

### **The Synchronization Protocol**

The system does not send whole files. It sends **Operations**.

1. **User A types 'X':** The client generates a unique operation ID: `{ client_id: 101, seq: 55 }`.
2. **Transmission:** This op is sent via WebSocket to the nearest Rust Server.
3. **Distribution:** The server broadcasts it to local users AND publishes it to the `updates:doc:UUID` channel on Redis.
4. **Convergence:** Other servers subscribe to that channel and forward the op to their connected users.
5. **Application:** The CRDT algorithm places 'X' in the correct position relative to its neighbors, regardless of arrival order.

```mermaid
graph TD
    UserA["User A (US)"] -->|WebSocket| Server1[Rust Server 1]
    UserB["User B (EU)"] -->|WebSocket| Server2[Rust Server 2]
    
    Server1 -->|Publish| Redis[("Redis Pub/Sub")]
    Server2 -->|Publish| Redis
    
    Redis -->|Subscribe| Server1
    Redis -->|Subscribe| Server2
    
    Server1 -->|Broadcast| UserA
    Server2 -->|Broadcast| UserB
```

---

## 🏃 Getting Started

### **Prerequisites**

* Docker & Docker Compose
* (Optional) Rust & Node.js installed locally

### **1. Run with Docker (Recommended)**

The easiest way to spin up the full stack (Redis + Rust Backend + React Client).

```bash
# Clone the repository
git clone [https://github.com/YOUR_USERNAME/yetanotheride.git](https://github.com/YOUR_USERNAME/yetanotheride.git)
cd yetanotheride

# Start the services
sudo docker compose up --build

```

* **Frontend:** `http://localhost:5173`
* **Backend:** `http://localhost:3000`

### **2. Run Manually (For Devs)**

**Step A: Start Redis**

```bash
docker run -p 6379:6379 redis:alpine

```

**Step B: Start Backend**

```bash
cd server
cargo run
# Listening on 0.0.0.0:3000

```

**Step C: Start Client**

```bash
cd client
npm install
npm run dev
# Running on localhost:5173

```

---

## 🧪 Technical Deep Dive: The CRDT Algorithm

Why RGA (Replicated Growable Array)?

Traditional Operational Transformation (OT) requires a central server to transform operations (like Google Docs). This introduces a single point of failure and latency bottlenecks.

**RGA** allows us to be **decentralized**. Every character in the document is a node in a linked list:

```rust
struct Node {
    id: OpId,        // Unique: (Client ID, Sequence #)
    origin: OpId,    // ID of the character immediately to the left
    value: char,
    visible: bool    // Tombstone for deletion
}

```

When inserting a character, we look for its `origin`. If multiple users insert at the same `origin` concurrently, we use the `client_id` as a tie-breaker. This guarantees that **all clients eventually converge to the exact same state**, mathematically.

---

## ☁️ Deployment

### **Environment Variables**

| Service | Variable | Value Example |
| --- | --- | --- |
| **Server** | `REDIS_URL` | `rediss://default:pass@url.upstash.io:6379` |
| **Server** | `PORT` | `3000` (Render sets this automatically) |
| **Client** | `VITE_WS_URL` | `wss://your-backend.onrender.com/ws` |

### **Steps**

1. **Redis:** Create a database on [Upstash](https://upstash.com).
2. **Backend:** Deploy the `./server` folder to [Render](https://render.com) (Docker Runtime).
3. **Frontend:** Deploy the `./client` folder to [Vercel](https://vercel.com).

---

## 🔮 Future Roadmap

* [ ] **Cursor Chat:** Press `/` to chat with other users inline.
* [ ] **History Replay:** A "Time Slider" to replay how the code was written.
* [ ] **Video Call:** WebRTC integration for face-to-face coding.

## 📄 License

MIT License.
